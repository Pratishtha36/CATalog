import tempfile
import json
import unittest
from datetime import timedelta
from pathlib import Path
from uuid import uuid4
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from main import create_app
from models import Completion, Operator, Task, Lesson, LessonDetails, MachineLog, utcnow
from coach import SCRIPTS, quiz_for


class CompanionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = create_app(f"sqlite:///{Path(self.temp.name) / 'test.db'}")
        self.client = TestClient(self.app).__enter__()
        self.operator = {'operator_id': 'OP1001'}

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.temp.cleanup()

    def test_cached_lessons_hide_answers_and_score_on_server(self):
        result = self.client.get('/api/training/assigned', params=self.operator).json()
        lesson = result['lessons'][0]
        self.assertNotIn('answer', lesson['quiz'][0])
        with patch.dict('os.environ', {'GEMINI_API_KEY': ''}):
            generated = self.client.post('/api/training/generate', json=self.operator).json()
        self.assertEqual(len(generated['lessons']), len(result['lessons']))
        body = self.operator | {'request_id': str(uuid4()), 'answers': [0, 1, 2]}
        path = f"/api/training/{lesson['id']}/complete"
        answer = self.client.post(path, json=body)
        self.assertEqual(answer.status_code, 200, answer.text)
        self.assertEqual(answer.json()['score'], 100)
        self.assertEqual(self.client.post(path, json=body).json(), answer.json())
        self.assertEqual(self.client.post(path, json=body | {'answers': [1, 1, 2]}).status_code, 409)
        self.assertEqual(self.client.post(path, json=body | {'request_id': str(uuid4()), 'answers': [9, 1, 2]}).status_code, 422)
        self.assertEqual(self.client.post(path, json=body | {'operator_id': 'someone-else'}).status_code, 404)
        with Session(self.app.state.engine) as session:
            self.assertEqual(len(session.exec(select(Completion)).all()), 1)
            self.assertEqual(session.get(Operator, 'OP1001').operator_skill, 'beginner')

    def test_prediction_range_and_honest_evaluation(self):
        body = self.operator | {'task_type': 'demolition', 'weather': 'windy', 'estimated_time_min': 90}
        response = self.client.post('/api/predict-time', json=body)
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertLessEqual(result['range_minutes'][0], result['predicted_minutes'])
        self.assertGreaterEqual(result['range_minutes'][1], result['predicted_minutes'])
        self.assertEqual(result['evaluation']['data_source'], 'synthetic_demo')
        self.assertGreater(result['evaluation']['mae_minutes'], 0)
        self.assertEqual(result['evaluation']['test_rows'], 400)
        self.assertEqual(self.client.post('/api/predict-time', json=body | {'estimated_time_min': 10000}).status_code, 422)
        self.assertEqual(self.client.post('/api/predict-time', json=body | {'operator_skill': 'expert'}).status_code, 422)

    def event(self, action, stamp, task=None, **extra):
        return self.operator | {'id': str(uuid4()), 'action': action, 'occurred_at': stamp.isoformat(), 'task_id': task, **extra}

    def test_offline_timestamps_retries_and_conflicts(self):
        tasks = self.client.get('/api/tasks/today', params=self.operator).json()['tasks']
        task = next(t for t in tasks if t['task_type'] == 'trenching')
        now = utcnow(); start = now - timedelta(minutes=2)
        # Keep event times inside the current site day even around midnight.
        from database import site_today
        from datetime import datetime, timezone
        day_start = datetime.combine(site_today(), datetime.min.time(), timezone(timedelta(hours=5, minutes=30)))
        start = max(start, day_start)
        self.assertEqual(self.client.post('/api/sync', json=self.event('shift_start', start)).status_code, 200)
        event = self.event('task_start', start, task['task_id'], pre_dig_acknowledged=True)
        self.assertEqual(self.client.post('/api/sync', json=event).status_code, 200)
        self.assertEqual(self.client.post('/api/sync', json=event).status_code, 200)
        self.assertEqual(self.client.post('/api/sync', json=event | {'pre_dig_acknowledged': False}).status_code, 409)
        other = self.event('task_start', now, tasks[1]['task_id'])
        self.assertEqual(self.client.post('/api/sync', json=other).status_code, 409)
        finish = self.event('task_finish', now, task['task_id'])
        self.assertEqual(self.client.post('/api/sync', json=finish).status_code, 200)
        self.assertEqual(self.client.post('/api/sync', json=finish).status_code, 200)
        with Session(self.app.state.engine) as session:
            row = session.get(Task, task['task_id'])
            self.assertAlmostEqual(row.actual_time_min, (now - start).total_seconds() / 60, places=3)

    def test_offline_pack_dashboard_and_handover(self):
        pack = self.client.get('/api/offline-pack', params=self.operator)
        self.assertEqual(pack.status_code, 200, pack.text)
        self.assertTrue(pack.json()['training']['lessons'])
        self.assertEqual(pack.json()['utilities']['source'], 'synthetic_demo')
        dashboard = self.client.get('/api/dashboard').json()
        self.assertEqual(len(dashboard['tasks']), 3)
        handover = self.client.get('/api/handover', params=self.operator).json()
        self.assertIsNone(handover['fuel_remaining'])
        self.assertEqual(handover['pending_tasks'], 3)
        self.assertEqual(self.client.get('/api/utilities/near?lat=200').status_code, 422)
        self.assertEqual(self.client.get('/api/utilities/near?lat=0&lng=0').json()['features'], [])

    def test_invalid_offline_clock_rejected(self):
        for stamp in (utcnow() + timedelta(hours=1), utcnow() - timedelta(days=8)):
            self.assertEqual(self.client.post('/api/sync', json=self.event('shift_start', stamp)).status_code, 422)

    def test_ai_json_is_validated_cached_and_does_not_send_identity(self):
        response = {'candidates': [{'content': {'parts': [{'text': json.dumps({'script_hi': SCRIPTS['idle'][1], 'quiz': quiz_for('idle')})}]}}]}
        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}), patch('coach.urlopen') as send:
            send.return_value.__enter__.return_value.read.return_value = json.dumps(response).encode()
            first = self.client.post('/api/training/generate', json=self.operator)
            self.assertEqual(first.status_code, 200, first.text)
            self.assertTrue(any(row['generation_source'] == 'gemini_draft' for row in first.json()['lessons']))
            call_count = send.call_count
            request_body = send.call_args.args[0].data.decode()
            self.assertNotIn('OP1001', request_body)
            self.assertNotIn('fixture-log', request_body)
            self.client.post('/api/training/generate', json=self.operator)
            self.assertEqual(send.call_count, call_count)

    def test_ai_outage_and_bad_json_preserve_templates_and_allow_retry(self):
        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}), patch('coach.urlopen', side_effect=TimeoutError):
            result = self.client.post('/api/training/generate', json=self.operator).json()
            self.assertTrue(result['generation_notice'])
            self.assertTrue(result['lessons'])
            self.assertFalse(any(row['generation_source'] == 'gemini_draft' for row in result['lessons']))
        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}), patch('coach.urlopen') as send:
            send.return_value.__enter__.return_value.read.return_value = b'{"candidates": []}'
            self.client.post('/api/training/generate', json=self.operator)
            self.assertGreater(send.call_count, 0)

    def test_new_records_survive_app_restart(self):
        lesson = self.client.get('/api/training/assigned', params=self.operator).json()['lessons'][0]
        body = self.operator | {'request_id': str(uuid4()), 'answers': [0, 1, 2]}
        self.client.post(f"/api/training/{lesson['id']}/complete", json=body)
        # A second application instance sees the same persisted tables.
        app = create_app(f"sqlite:///{Path(self.temp.name) / 'test.db'}")
        with TestClient(app) as client:
            rows = client.get('/api/training/assigned', params=self.operator).json()['lessons']
            self.assertEqual(next(row['best_score'] for row in rows if row['id'] == lesson['id']), 100)

    def test_seatbelt_coaching_excludes_old_episodes(self):
        with Session(self.app.state.engine) as session:
            for n, status in enumerate(['unfastened', 'fastened', 'unfastened']):
                session.add(MachineLog(id=f'old-belt-{n}', timestamp=utcnow() - timedelta(days=9, minutes=3-n),
                    machine_id='MC1001', operator_id='OP1001', data_source='sample_replay', seatbelt_status=status))
            session.commit()
        with patch.dict('os.environ', {'GEMINI_API_KEY': ''}):
            result = self.client.post('/api/training/generate', json=self.operator | {'source': 'sample_replay'}).json()
        self.assertFalse(any(row['trigger'] == 'seatbelt' for row in result['lessons']))
