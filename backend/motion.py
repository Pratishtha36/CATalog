"""Validated/idempotent phone observations and explicitly separate model sources."""
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
import threading
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator
from database import begin_write
from sqlmodel import Session, select

from models import Machine, MachineLog, MotionBatch, MotionModel, Operator, utcnow
from ml.motion_model import train_recordings


class ObservationBatch(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    id: UUID
    session_id: UUID
    sequence: int = Field(ge=0)
    operator_id: str
    machine_id: str
    source: Literal['phone', 'simulation']
    classifier: Literal['rules', 'random_forest', 'mixed']
    engine_running: bool
    started_at: AwareDatetime
    ended_at: AwareDatetime
    observed_seconds: float = Field(gt=0, le=65)
    idle_seconds: float = Field(ge=0, le=65)
    load_cycles: int = Field(ge=0, le=30)
    activity: Literal['idle', 'dig', 'swing', 'travel', 'unknown']

    @model_validator(mode='after')
    def validate_interval(self):
        duration = (self.ended_at - self.started_at).total_seconds()
        if duration <= 0 or duration > 180 or self.observed_seconds > duration + 1:
            raise ValueError('Observation duration does not fit the recording interval.')
        if self.idle_seconds > self.observed_seconds or (not self.engine_running and self.idle_seconds > 0):
            raise ValueError('Idle time requires confirmed engine-running and cannot exceed observed time.')
        if self.ended_at > datetime.now(timezone.utc) + timedelta(minutes=5):
            raise ValueError('Observation timestamps cannot be in the future.')
        return self


class Sample(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    t: float = Field(ge=0, le=86400000)
    ax: float = Field(ge=-200, le=200)
    ay: float = Field(ge=-200, le=200)
    az: float = Field(ge=-200, le=200)
    gx: float = Field(ge=-2000, le=2000)
    gy: float = Field(ge=-2000, le=2000)
    gz: float = Field(ge=-2000, le=2000)


class Recording(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    label: Literal['idle', 'dig', 'swing', 'travel']
    source: Literal['phone']
    samples: list[Sample] = Field(min_length=40, max_length=6000)


class TrainRequest(BaseModel):
    recordings: list[Recording] = Field(min_length=12, max_length=100)


def build_motion_router(engine, model_dir=None):
    router = APIRouter(prefix='/api/motion', tags=['SwingSense'])
    artifact_dir = Path(model_dir or os.getenv('MOTION_MODEL_DIR', Path(__file__).parent / 'ml/artifacts'))
    bundled_demo = Path(__file__).parent / 'ml/artifacts/demo-model.json'
    training_lock = threading.Lock()

    @router.post('/ingest')
    def ingest(body: ObservationBatch):
        payload = body.model_dump(mode='json')
        with Session(engine) as session:
            begin_write(session)
            if not session.get(Operator, body.operator_id) or not session.get(Machine, body.machine_id):
                raise HTTPException(404, 'Operator or machine not found')
            existing = session.get(MotionBatch, str(body.id))
            if existing:
                if existing.payload != payload:
                    raise HTTPException(409, 'This observation ID already has different data')
                return {'id': str(body.id), 'saved': True, 'duplicate': True}
            if session.exec(select(MotionBatch).where(MotionBatch.session_id == str(body.session_id), MotionBatch.sequence == body.sequence)).first():
                raise HTTPException(409, 'This session sequence is already saved under another ID')
            if session.get(MachineLog, str(body.id)):
                raise HTTPException(409, 'Observation ID conflicts with an existing log')
            session.add(MachineLog(id=str(body.id), timestamp=body.ended_at, operator_id=body.operator_id,
                machine_id=body.machine_id, idling_time_min=body.idle_seconds / 60 if body.engine_running else None,
                load_cycles=body.load_cycles, data_source='phone_estimate' if body.source == 'phone' else 'simulation'))
            session.flush()
            session.add(MotionBatch(id=str(body.id), session_id=str(body.session_id), sequence=body.sequence,
                operator_id=body.operator_id, source=body.source, payload=payload))
            session.commit()
        return {'id': str(body.id), 'saved': True, 'duplicate': False}

    @router.get('/recent')
    def recent(operator_id: str):
        with Session(engine) as session:
            rows = session.exec(select(MotionBatch).join(MachineLog).where(MotionBatch.operator_id == operator_id)
                .order_by(MachineLog.timestamp.desc()).limit(10)).all()
            return [row.payload for row in rows]

    @router.get('/model')
    def model(source: Literal['phone', 'simulation'] = 'phone'):
        if source == 'phone':
            with Session(engine) as session:
                stored = session.get(MotionModel, 'phone')
                if stored:
                    if stored.artifact.get('training_source') != source:
                        raise HTTPException(409, 'Model source mismatch')
                    return stored.artifact
            # Existing local CLI artifacts remain readable on SQLite only.
            if engine.dialect.name == 'postgresql':
                raise HTTPException(404, 'No phone model trained yet. Use rules while collecting labelled recordings.')
        path = artifact_dir / 'phone-model.json' if source == 'phone' else bundled_demo
        if not path.exists():
            raise HTTPException(404, 'No phone model trained yet. Use rules while collecting labelled recordings.')
        artifact = json.loads(path.read_text(encoding='utf-8'))
        if artifact['training_source'] != source:
            raise HTTPException(409, 'Model source mismatch')
        return artifact

    @router.post('/train')
    def train(body: TrainRequest):
        if not training_lock.acquire(blocking=False):
            raise HTTPException(409, 'Training already in progress')
        try:
            artifact = train_recordings([r.model_dump() for r in body.recordings], 'phone')
            with Session(engine) as session:
                begin_write(session)
                stored = session.get(MotionModel, 'phone')
                if stored:
                    stored.artifact = artifact
                    stored.updated_at = utcnow()
                else:
                    stored = MotionModel(id='phone', artifact=artifact)
                session.add(stored)
                session.commit()
            return artifact
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        finally:
            training_lock.release()

    return router
