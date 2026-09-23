"""Explainable operational insights and retry-safe incident reporting."""
import base64
import binascii
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator
from database import begin_write
from sqlmodel import Session, select

from models import Incident, Machine, MachineLog, Operator, Task

Source = Literal['demo_fixture', 'sample_replay', 'phone_estimate', 'simulation']
MAX_PHOTO_BYTES = 2 * 1024 * 1024


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def decode_photo(photo):
    if not photo:
        return None
    try:
        header, encoded = photo.split(',', 1)
        if header not in ('data:image/jpeg;base64', 'data:image/png;base64'):
            raise ValueError('Only JPEG and PNG photos are supported')
        data = base64.b64decode(encoded, validate=True)
        if not 20 <= len(data) <= MAX_PHOTO_BYTES:
            raise ValueError('Photo must be between 20 bytes and 2 MB')
        mime = header[5:].split(';')[0]
        if (mime == 'image/jpeg' and not data.startswith(b'\xff\xd8\xff')) or (mime == 'image/png' and not data.startswith(b'\x89PNG\r\n\x1a\n')):
            raise ValueError('Photo contents do not match its image type')
        return data, mime
    except (ValueError, binascii.Error) as error:
        raise ValueError(f'Invalid photo: {error}') from error


class IncidentInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True, allow_inf_nan=False)
    client_id: UUID
    operator_id: str
    machine_id: str
    type: Literal['incident', 'near_miss', 'unsafe_condition']
    note: str = Field(min_length=5, max_length=2000)
    created_at: AwareDatetime
    photo: str | None = Field(default=None, max_length=2800000)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode='after')
    def validate_report(self):
        if (self.lat is None) != (self.lng is None):
            raise ValueError('Provide both coordinates or neither')
        if self.created_at > datetime.now(timezone.utc) + timedelta(minutes=5):
            raise ValueError('Report timestamp cannot be in the future')
        decode_photo(self.photo)
        return self


def incident_summary(row):
    return {key: getattr(row, key) for key in ['id', 'client_id', 'operator_id', 'machine_id', 'type', 'note', 'lat', 'lng']} | {
        'created_at': utc(row.created_at).isoformat(), 'has_photo': bool(row.photo), 'source': 'operator_report'}


def analyze(logs, tasks):
    """Thresholds are demo heuristics, not calibrated machine limits."""
    flags = []
    for row in logs:
        evidence = {'log_id': row.id, 'timestamp': utc(row.timestamp).isoformat(), 'source': row.data_source,
                    'idling_time_min': row.idling_time_min, 'load_cycles': row.load_cycles, 'fuel_used_l': row.fuel_used_l}
        if row.idling_time_min is not None and row.idling_time_min > 20:
            flags.append({'id': f'idle-{row.id}', 'kind': 'idle', 'severity': 'warning', 'title': 'High recorded idle time',
                          'reason': f'{row.idling_time_min:g} idle minutes in this record exceed the 20-minute review threshold.',
                          'action': 'Review the operating context and whether the stationary time was necessary.', 'evidence': evidence})
        if row.fuel_used_l is not None and row.load_cycles is not None and row.load_cycles > 0:
            ratio = row.fuel_used_l / row.load_cycles
            if ratio > 1.5:
                flags.append({'id': f'fuel-{row.id}', 'kind': 'fuel', 'severity': 'warning', 'title': 'High fuel per load cycle',
                              'reason': f'{ratio:.2f} L/cycle exceeds the demo review threshold of 1.50 L/cycle.',
                              'action': 'Compare similar tasks and verify fuel and cycle measurements before drawing conclusions.',
                              'evidence': evidence | {'litres_per_cycle': round(ratio, 3)}})
    total_idle = sum(row.idling_time_min or 0 for row in logs)
    if total_idle > 20 and logs and logs[0].data_source in ('phone_estimate', 'simulation') and not any(flag['kind'] == 'idle' for flag in flags):
        flags.append({'id': 'idle-total', 'kind': 'idle', 'severity': 'review', 'title': 'Accumulated estimated idle time',
                      'reason': f'{total_idle:.1f} estimated idle minutes across the selected batches exceed the 20-minute review threshold. This is not necessarily continuous idle.',
                      'action': 'Review the recording range and engine-running confirmations.',
                      'evidence': {'idling_time_min': round(total_idle, 2), 'source': logs[0].data_source, 'log_ids': [row.id for row in logs if row.idling_time_min]}})
    # Replay snapshots are not proof of distinct violations: count observed transitions.
    events, previous = [], None
    for row in sorted(logs, key=lambda item: (utc(item.timestamp), item.id)):
        if row.seatbelt_status is None:
            continue
        if row.seatbelt_status == 'unfastened' and previous != 'unfastened':
            events.append(row.id)
        previous = row.seatbelt_status
    if len(events) >= 2:
        flags.append({'id': 'seatbelt-repeat', 'kind': 'seatbelt', 'severity': 'attention', 'title': 'Repeated unfastened seatbelt observations',
                      'reason': f'{len(events)} unfastened episodes observed in the selected records.',
                      'action': 'Review the observations and reinforce the pre-operation seatbelt check.',
                      'evidence': {'log_ids': events, 'episodes': len(events)}})
    for task in tasks:
        if task.actual_time_min is not None and task.estimated_time_min > 0 and task.actual_time_min > task.estimated_time_min * 1.2:
            flags.append({'id': f'overrun-{task.task_id}', 'kind': 'overrun', 'severity': 'review', 'title': f'{task.task_type.capitalize()} exceeded its estimate',
                          'reason': f'{task.actual_time_min:.1f} actual minutes versus {task.estimated_time_min:g} estimated (>20% overrun).',
                          'action': 'Review site conditions and the estimate; an overrun alone does not establish poor operator performance.',
                          'evidence': {'task_id': task.task_id, 'source': task.data_source, 'estimated_time_min': task.estimated_time_min,
                                       'actual_time_min': task.actual_time_min}})
    return flags


def build_operations_router(engine):
    router = APIRouter(prefix='/api')

    @router.get('/insights')
    def insights(operator_id: str, source: Source = 'demo_fixture'):
        with Session(engine) as session:
            if not session.get(Operator, operator_id):
                raise HTTPException(404, 'Operator not found')
            # Latest 200 records per source, with an explicit observed date range.
            logs = session.exec(select(MachineLog).where(MachineLog.operator_id == operator_id, MachineLog.data_source == source)
                                .order_by(MachineLog.timestamp.desc(), MachineLog.id.desc()).limit(200)).all()
            tasks = session.exec(select(Task).where(Task.operator_id == operator_id, Task.status == 'completed')
                                 .order_by(Task.finished_at.desc()).limit(100)).all()
            times = [utc(row.timestamp) for row in logs]
            return {'operator_id': operator_id, 'source': source, 'generated_at': datetime.now(timezone.utc).isoformat(),
                    'log_count': len(logs), 'completed_task_count': len(tasks),
                    'range_start': min(times).isoformat() if times else None, 'range_end': max(times).isoformat() if times else None,
                    'coverage': {'idle': sum(row.idling_time_min is not None for row in logs),
                                 'fuel_per_cycle': sum(row.fuel_used_l is not None and row.load_cycles is not None and row.load_cycles > 0 for row in logs),
                                 'seatbelt': sum(row.seatbelt_status is not None for row in logs)},
                    'flags': analyze(logs, tasks)}

    @router.post('/incidents')
    def create_incident(body: IncidentInput):
        with Session(engine) as session:
            begin_write(session)
            if not session.get(Operator, body.operator_id) or not session.get(Machine, body.machine_id):
                raise HTTPException(404, 'Operator or machine not found')
            identifier = str(body.client_id)
            existing = session.exec(select(Incident).where(Incident.client_id == identifier)).first()
            values = body.model_dump(exclude={'client_id'})
            if existing:
                same = all(utc(existing.created_at) == body.created_at if key == 'created_at' else getattr(existing, key) == value for key, value in values.items())
                if not same:
                    raise HTTPException(409, 'Report ID already contains different details')
                return {'id': existing.id, 'client_id': identifier, 'saved': True, 'duplicate': True}
            row = Incident(id=identifier, client_id=identifier, **values)
            session.add(row)
            session.commit()
            return {'id': identifier, 'client_id': identifier, 'saved': True, 'duplicate': False}

    @router.get('/incidents')
    def list_incidents(operator_id: str):
        with Session(engine) as session:
            if not session.get(Operator, operator_id):
                raise HTTPException(404, 'Operator not found')
            rows = session.exec(select(Incident).where(Incident.operator_id == operator_id).order_by(Incident.created_at.desc()).limit(50)).all()
            return [incident_summary(row) for row in rows]

    @router.get('/incidents/{incident_id}/photo')
    def incident_photo(incident_id: UUID):
        with Session(engine) as session:
            row = session.get(Incident, str(incident_id))
            if not row or not row.photo:
                raise HTTPException(404, 'Photo not found')
            data, mime = decode_photo(row.photo)
            return Response(data, media_type=mime, headers={'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store'})

    return router
