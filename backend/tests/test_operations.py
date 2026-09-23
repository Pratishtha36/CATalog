import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
import tempfile
import unittest
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlmodel import Session
from main import create_app
from models import MachineLog, Task, utcnow
from operations import analyze

PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XkAAAAASUVORK5CYII='


class OperationsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.url = f"sqlite:///{Path(self.temp.name) / 'operations.db'}"
        self.app = create_app(self.url)
        self.client = TestClient(self.app).__enter__()
        self.body = {'client_id': str(uuid4()), 'operator_id': 'OP1001', 'machine_id': 'MC1001',
                     'type': 'near_miss', 'note': 'Demo obstruction at loading area', 'photo': PNG,
                     'created_at': utcnow().isoformat(), 'lat': None, 'lng': None}

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.app.state.engine.dispose()
        self.temp.cleanup()

    def test_photo_report_parallel_retry_and_conflict(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _: self.client.post('/api/incidents', json=self.body), range(2)))
        self.assertTrue(all(r.status_code == 200 for r in responses))
        self.assertEqual(sum(r.json()['duplicate'] for r in responses), 1)
        self.assertEqual(self.client.post('/api/incidents', json=self.body | {'note': 'Different report'}).status_code, 409)
        rows = self.client.get('/api/incidents?operator_id=OP1001').json()
        self.assertEqual(len(rows), 1)
        self.assertNotIn('photo', rows[0])
        self.assertTrue(rows[0]['has_photo'])
        image = self.client.get(f"/api/incidents/{rows[0]['id']}/photo")
        self.assertEqual(image.content, base64.b64decode(PNG.split(',')[1]))
        self.assertEqual(image.headers['content-type'], 'image/png')

    def test_report_persists_after_restart(self):
        self.client.post('/api/incidents', json=self.body)
        with TestClient(create_app(self.url)) as other:
            rows = other.get('/api/incidents?operator_id=OP1001').json()
            self.assertEqual(rows[0]['client_id'], self.body['client_id'])
            self.assertTrue(other.post('/api/incidents', json=self.body).json()['duplicate'])

    def test_invalid_reports_are_rejected(self):
        for change in [{'note': '  '}, {'type': 'invalid'}, {'lat': 4}, {'lat': 91, 'lng': 4},
                       {'photo': 'data:image/svg+xml;base64,PHN2Zy8+'}, {'photo': 'data:image/png;base64,bad'},
                       {'created_at': '2026-09-23T12:00:00'}, {'created_at': (utcnow()+timedelta(days=1)).isoformat()}]:
            self.assertEqual(self.client.post('/api/incidents', json=self.body | change).status_code, 422, change)
        self.assertEqual(self.client.post('/api/incidents', json=self.body | {'operator_id': 'missing'}).status_code, 404)
        self.assertEqual(self.client.get(f'/api/incidents/{uuid4()}/photo').status_code, 404)

    def test_insights_preserve_source_and_unknown_measurements(self):
        demo = self.client.get('/api/insights?operator_id=OP1001').json()
        self.assertEqual({flag['kind'] for flag in demo['flags']}, {'idle', 'fuel'})
        self.assertEqual(demo['coverage']['fuel_per_cycle'], 1)
        with Session(self.app.state.engine) as session:
            session.add(MachineLog(id='sim-high', timestamp=utcnow(), machine_id='MC1001', operator_id='OP1001',
                                   idling_time_min=60, data_source='simulation'))
            session.commit()
        phone = self.client.get('/api/insights?operator_id=OP1001&source=phone_estimate').json()
        self.assertEqual(phone['log_count'], 0)
        self.assertEqual(phone['coverage']['fuel_per_cycle'], 0)
        self.assertEqual(phone['flags'], [])
        self.assertEqual(self.client.get('/api/insights?operator_id=OP1001&source=simulation').json()['log_count'], 1)
        self.assertEqual(self.client.get('/api/insights?operator_id=missing').status_code, 404)

    def test_seatbelt_snapshots_are_not_multiple_episodes_and_zero_cycles_are_unknown(self):
        def row(index, state):
            return MachineLog(id=str(index), timestamp=utcnow()+timedelta(seconds=index), machine_id='MC1001',
                              operator_id='OP1001', data_source='sample_replay', seatbelt_status=state,
                              fuel_used_l=10, load_cycles=0)
        logs = [row(0, 'unfastened'), row(1, 'unfastened')]
        self.assertEqual(analyze(logs, []), [])
        logs.extend([row(2, 'fastened'), row(3, 'unfastened')])
        flags = analyze(logs, [])
        self.assertEqual(len(flags), 1)
        self.assertEqual(flags[0]['evidence']['episodes'], 2)

    def test_short_phone_batches_accumulate_idle_without_claiming_continuity(self):
        logs = [MachineLog(id=str(i), timestamp=utcnow(), machine_id='MC1001', operator_id='OP1001',
                          data_source='phone_estimate', idling_time_min=1) for i in range(25)]
        flag = analyze(logs, [])[0]
        self.assertEqual(flag['evidence']['idling_time_min'], 25)
        self.assertIn('not necessarily continuous', flag['reason'])

    def test_task_overrun_requires_more_than_twenty_percent(self):
        task = Task(task_id='test', task_type='loading', weather='clear', operator_skill='beginner',
                    machine_age_yrs=12, estimated_time_min=10, actual_time_min=12,
                    operator_id='OP1001', machine_id='MC1001', status='completed',
                    lat=0, lng=0, location_name='Demo site', scheduled_date=utcnow().date(), data_source='manual_demo')
        self.assertEqual(analyze([], [task]), [])
        task.actual_time_min = 13
        flag = analyze([], [task])[0]
        self.assertEqual(flag['kind'], 'overrun')
        self.assertEqual(flag['evidence']['source'], 'manual_demo')


if __name__ == '__main__':
    unittest.main()
