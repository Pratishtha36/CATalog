import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import event, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel, create_engine

# Process environment (Render) wins over a local ignored file. Do not interpolate
# password characters such as ${...} from provider-generated connection strings.
load_dotenv(Path(__file__).parent / '.env', override=False, interpolate=False)
WRITE_LOCK_ID = 1894457819


def site_today():
    return datetime.now(timezone(timedelta(hours=5, minutes=30))).date()


def make_engine(url=None):
    configured_url = os.getenv('DATABASE_URL') or os.getenv('database_url')
    if url is None and os.getenv('RENDER') and not configured_url:
        raise ValueError('Set DATABASE_URL to your Supabase transaction-pooler URI on Render.')
    url = url or configured_url or f"sqlite:///{Path(__file__).parent / 'cabwise.db'}"
    if isinstance(url, str) and url.startswith('postgres://'):
        url = 'postgresql://' + url[len('postgres://'):]
    try:
        parsed = make_url(url)
    except Exception:
        raise ValueError('Invalid DATABASE_URL. Check the connection string in your environment.') from None
    if parsed.get_backend_name() == 'postgresql':
        parsed = parsed.set(drivername='postgresql+psycopg')
        if 'sslmode' not in parsed.query:
            parsed = parsed.update_query_dict({'sslmode': 'require'})
        if parsed.query.get('sslmode') not in ('require', 'verify-ca', 'verify-full'):
            raise ValueError('PostgreSQL DATABASE_URL must require TLS (sslmode=require or verify-full).')
        return create_engine(parsed, poolclass=NullPool, hide_parameters=True,
                             connect_args={'prepare_threshold': None, 'connect_timeout': 15})
    if parsed.get_backend_name() != 'sqlite':
        raise ValueError('DATABASE_URL must use PostgreSQL or SQLite.')
    engine = create_engine(parsed, connect_args={'check_same_thread': False, 'timeout': 15}, hide_parameters=True)

    @event.listens_for(engine, 'connect')
    def configure_sqlite(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')
        connection.execute('PRAGMA busy_timeout=15000')

    return engine


def begin_write(session):
    """Serialize MVP writes across processes, retaining exact-retry semantics.

    Transaction-scoped advisory locks work with transaction poolers; session-level
    locks do not. This deliberately retains the old single-writer MVP behaviour.
    """
    if session.get_bind().dialect.name == 'postgresql':
        session.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': WRITE_LOCK_ID})
    else:
        session.execute(text('BEGIN IMMEDIATE'))


def initialize_schema(engine):
    with engine.begin() as connection:
        if engine.dialect.name == 'postgresql':
            connection.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': WRITE_LOCK_ID})
        SQLModel.metadata.create_all(connection)
