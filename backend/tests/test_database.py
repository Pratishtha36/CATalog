import unittest
from unittest.mock import MagicMock, patch

from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex, CreateTable
from sqlalchemy.pool import NullPool

from database import make_engine, begin_write
from models import Task


class PostgreSQLConfigurationTests(unittest.TestCase):
    def test_pooler_connection_options(self):
        with patch('database.create_engine') as create:
            make_engine('postgres://demo:fake@localhost:6543/postgres')
        url = create.call_args.args[0]
        self.assertEqual(url.drivername, 'postgresql+psycopg')
        self.assertEqual(url.query['sslmode'], 'require')
        self.assertIs(create.call_args.kwargs['poolclass'], NullPool)
        self.assertIsNone(create.call_args.kwargs['connect_args']['prepare_threshold'])

    def test_insecure_connection_rejected(self):
        with self.assertRaises(ValueError):
            make_engine('postgresql://demo:fake@localhost/postgres?sslmode=disable')

    def test_lowercase_database_url(self):
        with patch.dict('os.environ', {'database_url': 'postgresql://demo:fake@localhost:6543/postgres'}, clear=True):
            with patch('database.create_engine') as create:
                make_engine()
        self.assertEqual(create.call_args.args[0].get_backend_name(), 'postgresql')

    def test_frontend_url_controls_cors(self):
        from fastapi.testclient import TestClient
        from main import create_app
        for name in ('FRONTEND_URL', 'frontend_url'):
            with self.subTest(name=name):
                with patch.dict('os.environ', {name: 'https://catalog.example/', 'CORS_ORIGINS': 'https://old.example'}, clear=True):
                    app = create_app('sqlite://')
                client = TestClient(app)
                headers = {'Origin': 'https://catalog.example', 'Access-Control-Request-Method': 'POST'}
                response = client.options('/api/tasks', headers=headers)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.headers['access-control-allow-origin'], 'https://catalog.example')
                headers['Origin'] = 'https://old.example'
                self.assertEqual(client.options('/api/tasks', headers=headers).status_code, 400)
                client.close()
                app.state.engine.dispose()

    def test_render_requires_database(self):
        with patch.dict('os.environ', {'RENDER': 'true'}, clear=True):
            with self.assertRaises(ValueError):
                make_engine()

    def test_active_task_indexes_are_partial(self):
        indexes = [i for i in Task.__table__.indexes if i.name.startswith('one_active')]
        self.assertEqual(len(indexes), 2)
        for index in indexes:
            ddl = str(CreateIndex(index).compile(dialect=postgresql.dialect()))
            self.assertIn("WHERE status = 'in_progress'", ddl)
        ddl = str(CreateTable(Task.__table__).compile(dialect=postgresql.dialect()))
        self.assertIn('TIMESTAMP WITH TIME ZONE', ddl)

    def test_write_lock_is_transaction_scoped(self):
        session = MagicMock()
        session.get_bind.return_value.dialect.name = 'postgresql'
        begin_write(session)
        self.assertIn('pg_advisory_xact_lock', str(session.execute.call_args.args[0]))
