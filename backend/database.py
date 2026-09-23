import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from sqlalchemy import event
from sqlmodel import create_engine


def site_today():
    return datetime.now(timezone(timedelta(hours=5, minutes=30))).date()


def make_engine(url=None):
    url = url or os.getenv('DATABASE_URL') or f"sqlite:///{Path(__file__).parent / 'cabwise.db'}"
    if not url.startswith('sqlite:///'):
        raise ValueError('This MVP supports file-backed SQLite URLs only.')
    engine = create_engine(url, connect_args={'check_same_thread': False, 'timeout': 15})

    @event.listens_for(engine, 'connect')
    def configure_sqlite(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')
        connection.execute('PRAGMA busy_timeout=15000')

    return engine
