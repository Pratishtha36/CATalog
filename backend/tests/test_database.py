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
