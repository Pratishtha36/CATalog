"""Offline task events retain client observation times and exact retry receipts."""
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, AwareDatetime, ConfigDict
from sqlalchemy import or_
from sqlmodel import Session, select
from database import begin_write, site_today
from models import Task, Operator, Shift, MachineLog, SyncReceipt, utcnow
from companion import assigned, require_operator, public_record, UTILITIES
from operations import utc


class TaskEvent(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID
    operator_id: str
    action: Literal['shift_start', 'task_start', 'task_finish']
    task_id: str | None = None
    occurred_at: AwareDatetime
    pre_dig_acknowledged: bool = False


def apply_event(engine, body):
    payload = body.model_dump(mode='json')
    with Session(engine) as session:
        begin_write(session)
        identifier = 'task-' + str(body.id)
        receipt = session.get(SyncReceipt, identifier)
        if receipt:
            if receipt.payload != payload: raise HTTPException(409, 'Event ID already used with different data')
            return receipt.result
        require_operator(session, body.operator_id)
        now = utcnow(); stamp = body.occurred_at
        if stamp > now + timedelta(minutes=5) or stamp < now - timedelta(days=7):
            raise HTTPException(422, 'Event time must be within the last seven days; check device clock')
        day = stamp.astimezone(timezone(timedelta(hours=5, minutes=30))).date()
        shift_id = f'{body.operator_id}:{day.isoformat()}'
        if body.action == 'shift_start':
            if not session.get(Shift, shift_id): session.add(Shift(id=shift_id, operator_id=body.operator_id, shift_date=day, started_at=stamp))
        else:
            task = session.get(Task, body.task_id)
            if not task or task.operator_id != body.operator_id: raise HTTPException(404, 'Task not found for operator')
            if body.action == 'task_start':
                if task.status != 'pending': raise HTTPException(409, 'Task changed on another device; review saved state')
                if task.scheduled_date != day: raise HTTPException(409, 'Task date differs from the recorded start date')
                if not session.get(Shift, shift_id): raise HTTPException(409, 'Sync the shift start first')
                if session.exec(select(Task).where(Task.status == 'in_progress', or_(Task.operator_id == body.operator_id, Task.machine_id == task.machine_id))).first():
                    raise HTTPException(409, 'Another task is active; review the conflict before retrying')
                if task.task_type in ('trenching', 'excavation') and not body.pre_dig_acknowledged:
                    raise HTTPException(409, 'Pre-dig acknowledgement required')
                task.status = 'in_progress'; task.started_at = stamp
                if body.pre_dig_acknowledged: task.pre_dig_acknowledged_at = stamp
            else:
                if task.status != 'in_progress' or not task.started_at: raise HTTPException(409, 'Task is not active; review saved state')
                if stamp < utc(task.started_at): raise HTTPException(422, 'Finish precedes start; check device clock')
                task.finished_at = stamp; task.status = 'completed'
                task.actual_time_min = round((stamp - utc(task.started_at)).total_seconds() / 60, 4)
            session.add(task)
        result = {'id': str(body.id), 'saved': True, 'occurred_at': stamp.isoformat(), 'action': body.action}
        session.add(SyncReceipt(id=identifier, payload=payload, result=result)); session.commit()
        return result


def build_offline_router(engine):
    router = APIRouter(prefix='/api')

    @router.post('/sync')
    def sync(body: TaskEvent): return apply_event(engine, body)

    @router.get('/offline-pack')
    def pack(operator_id: str):
        with Session(engine) as session:
            require_operator(session, operator_id)
            tasks = session.exec(select(Task).where(Task.operator_id == operator_id,
                or_(Task.scheduled_date == site_today(), Task.status == 'in_progress'))).all()
            safety = session.exec(select(MachineLog).where(MachineLog.operator_id == operator_id, MachineLog.seatbelt_status.is_not(None)).order_by(MachineLog.timestamp.desc())).first()
            shift = session.get(Shift, f'{operator_id}:{site_today()}')
            return {'operator_id': operator_id, 'cached_at': utcnow().isoformat(), 'operators': [p.model_dump() for p in session.exec(select(Operator)).all()],
                'data': {'date': site_today(), 'tasks': [public_record(t) for t in tasks], 'shift': public_record(shift) if shift else None,
                    'safety': {'seatbelt_status': safety.seatbelt_status if safety else None, 'data_source': safety.data_source if safety else None,
                        'timestamp': utc(safety.timestamp).isoformat() if safety else None, 'log_id': safety.id if safety else None}},
                'training': assigned(session, operator_id), 'utilities': UTILITIES}
    return router
