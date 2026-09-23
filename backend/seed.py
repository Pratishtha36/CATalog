"""Idempotent, non-destructive demo fixtures; not an official CAT dataset."""
from datetime import datetime, timezone
from sqlalchemy import text
from sqlmodel import Session, SQLModel
from database import make_engine, site_today
from models import Machine, MachineLog, Operator, Task


def seed_demo(engine, day=None):
    day = day or site_today()
    with Session(engine) as session:
        session.execute(text('BEGIN IMMEDIATE'))
        if not session.get(Operator, 'OP1001'):
            session.add(Operator(operator_id='OP1001', name='Demo operator'))
        if not session.get(Machine, 'MC1001'):
            session.add(Machine(machine_id='MC1001', model='CAT 320D', machine_age_yrs=12))
        session.flush()
        for number, kind, minutes, location in [
            (1, 'trenching', 60, 'Demo site · Utility corridor'),
            (2, 'loading', 35, 'Demo site · Material yard'),
            (3, 'grading', 45, 'Demo site · Access road'),
        ]:
            task_id = f'{day.isoformat()}-T{number:02d}'
            if not session.get(Task, task_id):
                session.add(Task(task_id=task_id, task_type=kind, weather='clear',
                    operator_skill='beginner', machine_age_yrs=12, estimated_time_min=minutes,
                    operator_id='OP1001', machine_id='MC1001', scheduled_date=day,
                    location_name=location, lat=28.6692, lng=77.4538))
        # Static historical sample: subsequent replays never get overwritten by seeding.
        if not session.get(MachineLog, 'fixture-log-001'):
            session.add(MachineLog(id='fixture-log-001', timestamp=datetime(2026, 9, 22, 8, tzinfo=timezone.utc),
                machine_id='MC1001', operator_id='OP1001', engine_hours=4200,
                fuel_used_l=3.8, load_cycles=2, idling_time_min=55,
                seatbelt_status='fastened', safety_alert_triggered=False, data_source='demo_fixture'))
        session.commit()


if __name__ == '__main__':
    engine = make_engine()
    SQLModel.metadata.create_all(engine)
    seed_demo(engine)
    print('Demo operator, machine, history, and today\'s tasks are ready. Existing work was preserved.')
