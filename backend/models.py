"""Database entities. Unknown telemetry stays nullable; fixture data is labelled."""
from datetime import date, datetime, timezone
from sqlalchemy import Column, DateTime, JSON, Index, text
from sqlmodel import Field, SQLModel


def utcnow():
    return datetime.now(timezone.utc)


class Operator(SQLModel, table=True):
    __tablename__ = 'operators'
    operator_id: str = Field(primary_key=True)
    name: str
    language: str = 'hi-IN'
    operator_skill: str = 'beginner'
    data_source: str = 'demo_fixture'


class Machine(SQLModel, table=True):
    __tablename__ = 'machines'
    machine_id: str = Field(primary_key=True)
    model: str
    machine_age_yrs: int
    data_source: str = 'demo_fixture'


class Shift(SQLModel, table=True):
    __tablename__ = 'shifts'
    id: str = Field(primary_key=True)
    operator_id: str = Field(foreign_key='operators.operator_id', index=True)
    shift_date: date
    started_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))


class Task(SQLModel, table=True):
    __tablename__ = 'tasks'
    __table_args__ = (
        Index('one_active_task_per_operator', 'operator_id', unique=True, sqlite_where=text("status = 'in_progress'"), postgresql_where=text("status = 'in_progress'")),
        Index('one_active_task_per_machine', 'machine_id', unique=True, sqlite_where=text("status = 'in_progress'"), postgresql_where=text("status = 'in_progress'")),
    )
    task_id: str = Field(primary_key=True)
    task_type: str
    weather: str
    operator_skill: str
    machine_age_yrs: int
    estimated_time_min: float
    actual_time_min: float | None = None
    operator_id: str = Field(foreign_key='operators.operator_id', index=True)
    machine_id: str = Field(foreign_key='machines.machine_id')
    status: str = 'pending'
    lat: float
    lng: float
    scheduled_date: date = Field(index=True)
    location_name: str
    started_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    finished_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    pre_dig_acknowledged_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    data_source: str = 'demo_fixture'


class MachineLog(SQLModel, table=True):
    __tablename__ = 'machine_logs'
    id: str = Field(primary_key=True)
    timestamp: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))
    machine_id: str = Field(foreign_key='machines.machine_id')
    operator_id: str = Field(foreign_key='operators.operator_id', index=True)
    engine_hours: float | None = None
    fuel_used_l: float | None = None
    load_cycles: int | None = None
    idling_time_min: float | None = None
    seatbelt_status: str | None = None
    safety_alert_triggered: bool | None = None
    data_source: str


class Incident(SQLModel, table=True):
    __tablename__ = 'incidents'
    id: str = Field(primary_key=True)
    client_id: str = Field(unique=True)
    operator_id: str = Field(foreign_key='operators.operator_id')
    machine_id: str = Field(foreign_key='machines.machine_id')
    type: str
    note: str = ''
    photo: str | None = None
    lat: float | None = None
    lng: float | None = None
    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))


class Lesson(SQLModel, table=True):
    __tablename__ = 'lessons'
    id: str = Field(primary_key=True)
    operator_id: str = Field(foreign_key='operators.operator_id')
    title: str
    trigger: str
    script_hi: str
    quiz: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))


class Completion(SQLModel, table=True):
    __tablename__ = 'completions'
    id: str = Field(primary_key=True)
    operator_id: str = Field(foreign_key='operators.operator_id')
    lesson_id: str = Field(foreign_key='lessons.id')
    score: int
    completed_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))

class MotionBatch(SQLModel, table=True):
    __tablename__ = 'motion_batches'
    __table_args__ = (Index('unique_motion_session_sequence', 'session_id', 'sequence', unique=True),)
    id: str = Field(primary_key=True, foreign_key='machine_logs.id')
    session_id: str
    sequence: int
    operator_id: str = Field(foreign_key='operators.operator_id', index=True)
    source: str
    payload: dict = Field(sa_column=Column(JSON, nullable=False))


class MotionModel(SQLModel, table=True):
    __tablename__ = 'motion_models'
    id: str = Field(primary_key=True)
    artifact: dict = Field(sa_column=Column(JSON, nullable=False))
    updated_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))


class LessonDetails(SQLModel, table=True):
    __tablename__ = 'lesson_details'
    id: str = Field(primary_key=True, foreign_key='lessons.id')
    evidence: dict = Field(sa_column=Column(JSON, nullable=False))
    source: str


class SyncReceipt(SQLModel, table=True):
    __tablename__ = 'sync_receipts'
    id: str = Field(primary_key=True)
    payload: dict = Field(sa_column=Column(JSON, nullable=False))
    result: dict = Field(sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))
