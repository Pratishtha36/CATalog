"""Integration tests use disposable file-backed databases, never the demo database."""
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import inspect
from sqlmodel import Session, select

from database import site_today
from main import create_app
from models import MachineLog, Operator, Task, utcnow
from seed import seed_demo


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.url = f"sqlite:///{Path(self.temp.name) / 'test.db'}"
        self.app = create_app(self.url)
        self.client = TestClient(self.app).__enter__()
        self.body = {'operator_id': 'OP1001'}
        self.tasks = self.client.get('/api/tasks/today', params=self.body).json()['tasks']

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.app.state.engine.dispose()
        self.temp.cleanup()

    def start_shift(self):
        return self.client.post('/api/shifts/start', json=self.body)

    def test_add_activity_after_completion_and_retry_without_duplicates(self):
        self.start_shift()
        for task in self.tasks:
            self.client.post(f"/api/tasks/{task['task_id']}/start", json=self.body | {'pre_dig_acknowledged': True})
            self.client.post(f"/api/tasks/{task['task_id']}/finish", json=self.body)
        payload = self.body | {'request_id': str(uuid4()), 'task_type': 'trenching',
                              'location_name': 'New demo area', 'estimated_time_min': 10, 'weather': 'clear'}
        response = self.client.post('/api/tasks', json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        task = response.json()
        self.assertEqual(task['status'], 'pending')
        self.assertEqual(task['data_source'], 'manual_demo')
        self.assertEqual(self.client.post('/api/tasks', json=payload).json()['task_id'], task['task_id'])
        self.assertEqual(self.client.post('/api/tasks', json=payload | {'estimated_time_min': 11}).status_code, 409)
        for changes in [{'location_name': '  '}, {'estimated_time_min': 0}, {'task_type': 'invalid'}]:
            self.assertEqual(self.client.post('/api/tasks', json=payload | changes).status_code, 422)
        rows = self.client.get('/api/tasks/today', params=self.body).json()['tasks']
        self.assertEqual(len(rows), 4)
        self.assertEqual(sum(row['status'] == 'completed' for row in rows), 3)
        self.assertEqual(self.client.post(f"/api/tasks/{task['task_id']}/start", json=self.body).status_code, 409)
        self.assertEqual(self.client.post(f"/api/tasks/{task['task_id']}/start", json=self.body | {'pre_dig_acknowledged': True}).status_code, 200)

    def action(self, index, action, **extra):
        return self.client.post(f"/api/tasks/{self.tasks[index]['task_id']}/{action}", json=self.body | extra)

    def test_schema_seed_and_profile_are_consistent(self):
        tables = set(inspect(self.app.state.engine).get_table_names())
        self.assertTrue({'operators', 'machines', 'tasks', 'machine_logs', 'shifts', 'incidents', 'lessons', 'completions'} <= tables)
        self.assertEqual(len(self.tasks), 3)
        self.assertEqual(self.client.get('/api/operators/OP1001').json()['data_source'], 'demo_fixture')
        self.assertEqual(self.client.get('/api/machines/MC1001').json()['machine_age_yrs'], 12)
        self.assertTrue(all(t['actual_time_min'] is None for t in self.tasks))
        seed_demo(self.app.state.engine)
        self.assertEqual(len(self.client.get('/api/tasks/today', params=self.body).json()['tasks']), 3)

    def test_shift_required_and_idempotent(self):
        self.assertEqual(self.action(1, 'start').status_code, 409)
        first = self.start_shift().json()
        self.assertEqual(first, self.start_shift().json())
        self.assertTrue(first['shift']['started_at'].endswith('+00:00'))

    def test_trenching_requires_acknowledgement(self):
        self.start_shift()
        self.assertEqual(self.action(0, 'start').status_code, 409)
        result = self.action(0, 'start', pre_dig_acknowledged=True)
        self.assertEqual(result.status_code, 200)
        self.assertIsNotNone(result.json()['pre_dig_acknowledged_at'])

    def test_lifecycle_idempotence_and_actual_duration(self):
        self.start_shift()
        started = self.action(1, 'start').json()
        self.assertEqual(started, self.action(1, 'start').json())
        self.assertEqual(self.action(2, 'start').status_code, 409)
        with Session(self.app.state.engine) as session:
            task = session.get(Task, self.tasks[1]['task_id'])
            task.started_at = utcnow() - timedelta(minutes=12)
            session.add(task)
            session.commit()
        finished = self.action(1, 'finish').json()
        self.assertEqual(finished['status'], 'completed')
        self.assertAlmostEqual(finished['actual_time_min'], 12, delta=0.1)
        self.assertEqual(finished, self.action(1, 'finish').json())
        self.assertEqual(self.action(1, 'start').status_code, 409)
        self.assertEqual(self.action(2, 'start').status_code, 200)

    def test_invalid_transitions_and_operator_assignment(self):
        self.assertEqual(self.action(2, 'finish').status_code, 409)
        self.assertEqual(self.client.get('/api/tasks/today?operator_id=missing').status_code, 404)
        with Session(self.app.state.engine) as session:
            session.add(Operator(operator_id='OP2002', name='Test operator'))
            session.commit()
        response = self.client.post(f"/api/tasks/{self.tasks[0]['task_id']}/start", json={'operator_id': 'OP2002'})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(self.client.post('/api/tasks/missing/finish', json=self.body).status_code, 404)

    def test_sample_replay_persists_and_does_not_fabricate_telemetry(self):
        endpoint = '/api/safety/replay'
        body = self.body | {'seatbelt_status': 'unfastened'}
        self.assertEqual(self.client.post(endpoint, json=body).status_code, 409)
        self.start_shift()
        replayed = self.client.post(endpoint, json=body).json()
        self.assertFalse(replayed['is_live'])
        self.assertEqual(replayed['data_source'], 'sample_replay')
        self.assertEqual(replayed, self.client.post(endpoint, json=body).json())
        seed_demo(self.app.state.engine)
        self.assertEqual(replayed, self.client.get('/api/safety/status', params=self.body).json())
        with Session(self.app.state.engine) as session:
            row = session.get(MachineLog, replayed['log_id'])
            self.assertIsNone(row.fuel_used_l)
            self.assertIsNone(row.engine_hours)
            self.assertIsNone(row.load_cycles)
        self.assertEqual(self.client.post(endpoint, json=self.body | {'seatbelt_status': 'unknown'}).status_code, 422)
        self.assertEqual(self.client.post(endpoint, json=self.body | {'seatbelt_status': 'fastened'}).json()['seatbelt_status'], 'fastened')

    def test_restart_preserves_task_and_shift(self):
        shift = self.start_shift().json()
        task = self.action(1, 'start').json()
        other_app = create_app(self.url)
        with TestClient(other_app) as other:
            saved = other.get('/api/tasks/today', params=self.body).json()['tasks']
            self.assertEqual(saved[1], task)
            self.assertEqual(other.get('/api/shifts/current', params=self.body).json(), shift)

    def test_concurrent_starts_allow_only_one_task(self):
        self.start_shift()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda index: self.action(index, 'start').status_code, [1, 2]))
        self.assertEqual(sorted(results), [200, 409])

    def test_parallel_retries_keep_same_start_time(self):
        self.start_shift()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.action(1, 'start').json(), range(2)))
        self.assertEqual(results[0], results[1])

    def test_active_task_carries_over_and_old_pending_cannot_start(self):
        self.start_shift()
        task = self.action(1, 'start').json()
        tomorrow = site_today() + timedelta(days=1)
        with patch('main.site_today', return_value=tomorrow), patch('seed.site_today', return_value=tomorrow):
            response = self.client.get('/api/tasks/today', params=self.body).json()
            self.assertEqual(len(response['tasks']), 4)
            self.assertIn(task['task_id'], [item['task_id'] for item in response['tasks']])
            self.assertEqual(self.action(2, 'start').status_code, 409)
            self.assertEqual(self.action(1, 'finish').status_code, 200)

    def test_health_and_cors_for_mutations(self):
        self.assertEqual(self.client.get('/api/health').json()['service'], 'catalog-api')
        response = self.client.get('/health')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), self.client.get('/api/health').json())
        self.assertEqual(response.json()['status'], 'ok')
        allowed = self.client.options('/api/shifts/start', headers={'Origin': 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type'})
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.headers['access-control-allow-origin'], 'http://localhost:5173')
        denied = self.client.get('/api/health', headers={'Origin': 'https://unlisted.example'})
        self.assertNotIn('access-control-allow-origin', denied.headers)


if __name__ == '__main__':
    unittest.main()
