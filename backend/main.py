"""CabWise demo API: persistent tasks and explicit sample-data safety replay."""
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import or_, text
from sqlmodel import Session, SQLModel, select

from database import make_engine, site_today
from models import Machine, MachineLog, Operator, Shift, Task, utcnow
from seed import seed_demo
from motion import build_motion_router


class OperatorAction(BaseModel):
    operator_id: str


class StartTask(OperatorAction):
    pre_dig_acknowledged: bool = False


class ReplayAction(OperatorAction):
    seatbelt_status: Literal['fastened', 'unfastened']


def as_utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def serialize(value):
    if value is None:
        return None
    return {key: as_utc(item).isoformat() if isinstance(item, datetime) else item
            for key, item in value.model_dump().items()}


def create_app(database_url=None, model_dir=None):
    engine = make_engine(database_url)

    @asynccontextmanager
    async def lifespan(app):
        SQLModel.metadata.create_all(engine)
        seed_demo(engine)
        yield
        engine.dispose()

    app = FastAPI(title='CabWise API', version='0.3.0', lifespan=lifespan)
    app.state.engine = engine
    origins = [origin.strip().rstrip('/') for origin in os.getenv(
        'CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',') if origin.strip()]
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=['GET', 'POST'],
                       allow_headers=['Content-Type'])

    def session_dependency():
        with Session(engine) as session:
            yield session

    def require_operator(session, operator_id):
        operator = session.get(Operator, operator_id)
        if not operator:
            raise HTTPException(404, 'Operator not found')
        return operator

    def current_shift(session, operator_id):
        return session.get(Shift, f'{operator_id}:{site_today().isoformat()}')

    def safety(session, operator_id):
        row = session.exec(select(MachineLog).where(MachineLog.operator_id == operator_id, MachineLog.seatbelt_status.is_not(None))
                           .order_by(MachineLog.timestamp.desc(), MachineLog.id.desc())).first()
        return {'operator_id': operator_id, 'seatbelt_status': row.seatbelt_status if row else None,
                'data_source': row.data_source if row else None,
                'timestamp': as_utc(row.timestamp).isoformat() if row else None,
                'log_id': row.id if row else None, 'is_live': False}

    @app.get('/api/health')
    def health(session: Session = Depends(session_dependency)):
        session.execute(text('SELECT 1'))
        return {'status': 'ok', 'service': 'cabwise-api', 'version': '0.3.0'}

    @app.get('/api/operators')
    def operators(session: Session = Depends(session_dependency)):
        return session.exec(select(Operator).order_by(Operator.operator_id)).all()

    @app.get('/api/operators/{operator_id}')
    def profile(operator_id: str, session: Session = Depends(session_dependency)):
        return require_operator(session, operator_id)

    @app.get('/api/machines/{machine_id}')
    def machine(machine_id: str, session: Session = Depends(session_dependency)):
        row = session.get(Machine, machine_id)
        if not row:
            raise HTTPException(404, 'Machine not found')
        return row

    @app.get('/api/machine-logs')
    def logs(operator_id: str, session: Session = Depends(session_dependency)):
        require_operator(session, operator_id)
        rows = session.exec(select(MachineLog).where(MachineLog.operator_id == operator_id)
                            .order_by(MachineLog.timestamp.desc()).limit(100)).all()
        return [serialize(row) for row in rows]

    @app.get('/api/tasks/today')
    def tasks_today(operator_id: str, session: Session = Depends(session_dependency)):
        require_operator(session, operator_id)
        session.rollback()
        seed_demo(engine)
        tasks = session.exec(select(Task).where(Task.operator_id == operator_id,
            or_(Task.scheduled_date == site_today(), Task.status == 'in_progress')).order_by(Task.task_id)).all()
        return {'date': site_today(), 'timezone': 'Asia/Kolkata', 'tasks': [serialize(task) for task in tasks]}

    @app.get('/api/shifts/current')
    def get_shift(operator_id: str, session: Session = Depends(session_dependency)):
        require_operator(session, operator_id)
        return {'shift': serialize(current_shift(session, operator_id))}

    @app.post('/api/shifts/start')
    def start_shift(body: OperatorAction, session: Session = Depends(session_dependency)):
        session.execute(text('BEGIN IMMEDIATE'))
        require_operator(session, body.operator_id)
        shift = current_shift(session, body.operator_id)
        if not shift:
            shift = Shift(id=f'{body.operator_id}:{site_today().isoformat()}',
                          operator_id=body.operator_id, shift_date=site_today())
            session.add(shift)
            session.commit()
            session.refresh(shift)
        return {'shift': serialize(shift)}

    @app.post('/api/tasks/{task_id}/start')
    def start_task(task_id: str, body: StartTask, session: Session = Depends(session_dependency)):
        session.execute(text('BEGIN IMMEDIATE'))
        require_operator(session, body.operator_id)
        task = session.get(Task, task_id)
        if not task or task.operator_id != body.operator_id:
            raise HTTPException(404, 'Task not found for this operator')
        if task.status == 'in_progress':
            return serialize(task)
        if task.status != 'pending':
            raise HTTPException(409, 'A completed task cannot be restarted')
        if task.scheduled_date != site_today():
            raise HTTPException(409, 'Only today\'s pending tasks can be started')
        if not current_shift(session, body.operator_id):
            raise HTTPException(409, 'Start your shift first')
        if session.exec(select(Task).where(Task.status == 'in_progress',
            or_(Task.operator_id == body.operator_id, Task.machine_id == task.machine_id))).first():
            raise HTTPException(409, 'Finish the active task before starting another')
        if task.task_type in ('trenching', 'excavation') and not body.pre_dig_acknowledged:
            raise HTTPException(409, 'Review and acknowledge the demo pre-dig check first')
        task.status = 'in_progress'
        task.started_at = utcnow()
        if task.task_type in ('trenching', 'excavation'):
            task.pre_dig_acknowledged_at = task.started_at
        session.add(task)
        session.commit()
        session.refresh(task)
        return serialize(task)

    @app.post('/api/tasks/{task_id}/finish')
    def finish_task(task_id: str, body: OperatorAction, session: Session = Depends(session_dependency)):
        session.execute(text('BEGIN IMMEDIATE'))
        require_operator(session, body.operator_id)
        task = session.get(Task, task_id)
        if not task or task.operator_id != body.operator_id:
            raise HTTPException(404, 'Task not found for this operator')
        if task.status == 'completed':
            return serialize(task)
        if task.status != 'in_progress' or task.started_at is None:
            raise HTTPException(409, 'Start this task before finishing it')
        task.finished_at = utcnow()
        task.actual_time_min = round(max(0, (task.finished_at - as_utc(task.started_at)).total_seconds() / 60), 4)
        task.status = 'completed'
        session.add(task)
        session.commit()
        session.refresh(task)
        return serialize(task)

    @app.get('/api/safety/status')
    def safety_status(operator_id: str, session: Session = Depends(session_dependency)):
        require_operator(session, operator_id)
        return safety(session, operator_id)

    @app.post('/api/safety/replay')
    def replay(body: ReplayAction, session: Session = Depends(session_dependency)):
        session.execute(text('BEGIN IMMEDIATE'))
        require_operator(session, body.operator_id)
        if not current_shift(session, body.operator_id):
            raise HTTPException(409, 'Start your shift before replaying sample data')
        previous = safety(session, body.operator_id)
        if previous['seatbelt_status'] != body.seatbelt_status:
            session.add(MachineLog(id=str(uuid4()), operator_id=body.operator_id, machine_id='MC1001',
                seatbelt_status=body.seatbelt_status, safety_alert_triggered=body.seatbelt_status == 'unfastened',
                data_source='sample_replay'))
            session.commit()
        return safety(session, body.operator_id)

    app.include_router(build_motion_router(engine, model_dir))
    return app


app = create_app()
