"""Motion ingestion and model boundaries, tested without touching demo data."""
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path
from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from main import create_app
from models import MachineLog, MotionBatch, MotionModel, utcnow


class MotionApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = create_app(f"sqlite:///{Path(self.temp.name) / 'motion.db'}", Path(self.temp.name) / 'models')
        self.client = TestClient(self.app).__enter__()
        end = utcnow()
        self.row = {'id': str(uuid4()), 'session_id': str(uuid4()), 'sequence': 0, 'operator_id': 'OP1001',
            'machine_id': 'MC1001', 'source': 'phone', 'classifier': 'rules', 'engine_running': True,
            'started_at': (end-timedelta(seconds=60)).isoformat(), 'ended_at': end.isoformat(),
            'observed_seconds': 60, 'idle_seconds': 20, 'load_cycles': 2, 'activity': 'dig'}

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.temp.cleanup()

    def ingest(self, row=None):
        return self.client.post('/api/motion/ingest', json=row or self.row)

    def test_observations_preserve_unknown_telemetry_and_seatbelt_state(self):
        previous = self.client.get('/api/safety/status?operator_id=OP1001').json()
        self.assertEqual(self.ingest().status_code, 200)
        self.assertEqual(previous, self.client.get('/api/safety/status?operator_id=OP1001').json())
        with Session(self.app.state.engine) as session:
            log = session.get(MachineLog, self.row['id'])
            self.assertEqual(log.data_source, 'phone_estimate')
            self.assertAlmostEqual(log.idling_time_min, 1/3)
            for field in ['engine_hours', 'fuel_used_l', 'seatbelt_status', 'safety_alert_triggered']:
                self.assertIsNone(getattr(log, field))
        self.assertEqual(self.client.get('/api/motion/recent?operator_id=OP1001').json()[0]['id'], self.row['id'])

    def test_parallel_retry_is_idempotent_and_conflicting_data_is_rejected(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _: self.ingest(), range(2)))
        self.assertEqual([r.status_code for r in responses], [200, 200])
        self.assertEqual(sum(r.json()['duplicate'] for r in responses), 1)
        self.assertEqual(self.ingest(self.row | {'idle_seconds': 21}).status_code, 409)
        self.assertEqual(self.ingest(self.row | {'id': str(uuid4())}).status_code, 409)
        with Session(self.app.state.engine) as session:
            self.assertEqual(len(session.exec(select(MotionBatch)).all()), 1)

    def test_simulation_is_separate_and_engine_off_does_not_infer_idle(self):
        row = self.row | {'source': 'simulation', 'engine_running': False, 'idle_seconds': 0}
        self.assertEqual(self.ingest(row).status_code, 200)
        with Session(self.app.state.engine) as session:
            log = session.get(MachineLog, row['id'])
            self.assertEqual(log.data_source, 'simulation')
            self.assertIsNone(log.idling_time_min)

    def test_invalid_measurements_and_identifiers_are_rejected(self):
        for changes in [{'idle_seconds': 61}, {'engine_running': False}, {'observed_seconds': 100},
                        {'load_cycles': -1}, {'ended_at': self.row['started_at']}, {'source':'telematics'},
                        {'fuel_used_l': 10}, {'started_at':'2026-09-23T10:00:00'}]:
            self.assertEqual(self.ingest(self.row | changes).status_code, 422, changes)
        self.assertEqual(self.ingest(self.row | {'operator_id':'missing'}).status_code, 404)

    def test_phone_model_requires_real_recordings_and_never_serves_demo_as_phone(self):
        self.assertEqual(self.client.get('/api/motion/model?source=phone').status_code, 404)
        self.assertEqual(self.client.post('/api/motion/train', json={'recordings': []}).status_code, 422)
        sample = {'t':0,'ax':0,'ay':0,'az':9.81,'gx':0,'gy':0,'gz':0}
        recording = {'id':'sim','label':'idle','source':'simulation','samples':[sample]*40}
        self.assertEqual(self.client.post('/api/motion/train',json={'recordings':[recording]*12}).status_code,422)

    def test_training_persists_and_serves_the_same_artifact(self):
        # Synthetic fixtures exercise the phone API contract only, in a temporary
        # directory. These are never published as a real phone model or evaluation.
        from ml.motion_model import simulator_recordings
        records = [dict(row, source='phone', samples=row['samples'][:151])
                   for row in simulator_recordings()]
        response = self.client.post('/api/motion/train', json={'recordings': records})
        self.assertEqual(response.status_code, 200, response.text)
        artifact = response.json()
        self.assertEqual(artifact['training_source'], 'phone')
        self.assertEqual(self.client.get('/api/motion/model?source=phone').json(), artifact)
        with Session(self.app.state.engine) as session:
            self.assertEqual(session.get(MotionModel, 'phone').artifact, artifact)


if __name__ == '__main__':
    unittest.main()
