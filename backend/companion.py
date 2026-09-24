"""Training, estimates, map fixtures and supervisor aggregation."""
from datetime import datetime, timedelta, timezone
import os
import threading
from collections import Counter
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, select
from database import begin_write, site_today
from models import Operator, Machine, Task, MachineLog, Incident, Lesson, LessonDetails, Completion, SyncReceipt, Shift, utcnow
from operations import analyze, utc, incident_summary
from coach import build_lesson, personalise
from ml.time_model import predict_time

GENERATION_LOCK = threading.Lock()

UTILITIES = {'type': 'FeatureCollection', 'source': 'synthetic_demo', 'features': [
    {'type': 'Feature', 'id': 'demo-fibre', 'properties': {'owner': 'Demo network', 'type': 'fibre', 'depth_m': None},
     'geometry': {'type': 'LineString', 'coordinates': [[77.4538, 28.6685], [77.4538, 28.6700]]}},
    {'type': 'Feature', 'id': 'demo-water', 'properties': {'owner': 'Demo water', 'type': 'water', 'depth_m': None},
     'geometry': {'type': 'LineString', 'coordinates': [[77.4528, 28.6696], [77.4548, 28.6696]]}},
]}


class GenerateInput(BaseModel):
    operator_id: str
    source: Literal['demo_fixture', 'sample_replay', 'phone_estimate', 'simulation'] = 'demo_fixture'


class QuizInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    operator_id: str
    request_id: UUID
    answers: list[int] = Field(min_length=3, max_length=3)


class PredictionInput(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    operator_id: str
    machine_id: str = 'MC1001'
    task_type: Literal['loading', 'grading', 'trenching', 'excavation', 'demolition']
    weather: Literal['clear', 'rainy', 'windy']
    estimated_time_min: float = Field(ge=5, le=240)


def require_operator(session, operator_id):
    operator = session.get(Operator, operator_id)
    if not operator:
        raise HTTPException(404, 'Operator not found')
    return operator


def public_record(row):
    return {key: utc(value).isoformat() if isinstance(value, datetime) else value for key, value in row.model_dump().items()}


def lesson_view(session, row):
    detail = session.get(LessonDetails, row.id)
    scores = session.exec(select(Completion).where(Completion.lesson_id == row.id, Completion.operator_id == row.operator_id)).all()
    return row.model_dump(exclude={'quiz'}) | {'created_at': utc(row.created_at).isoformat(),
        'quiz': [{k: v for k, v in q.items() if k != 'answer'} for q in row.quiz],
        'best_score': max((r.score for r in scores), default=None),
        'evidence': detail.evidence if detail else {}, 'generation_source': detail.source if detail else 'legacy',
        'audio_url': f'/audio/coach/{row.trigger}.mp3'}


def assigned(session, operator_id):
    require_operator(session, operator_id)
    rows = session.exec(select(Lesson).where(Lesson.operator_id == operator_id).order_by(Lesson.created_at.desc()).limit(50)).all()
    lessons = [lesson_view(session, row) for row in rows]
    passed = sum(row['best_score'] == 100 for row in lessons)
    return {'lessons': lessons, 'passed_lessons': passed, 'training_level': 'Practising' if passed < 3 else 'Consistent learner',
            'ai_configured': bool(os.getenv('GEMINI_API_KEY')),
            'notice': 'Learning progress only. Recorded operator skill and certification are unchanged.'}


def generate_lessons(engine, body, use_ai=True):
    provider_failed = False
    with Session(engine) as session:
        require_operator(session, body.operator_id)
        logs = session.exec(select(MachineLog).where(MachineLog.operator_id == body.operator_id, MachineLog.data_source == body.source)
                            .order_by(MachineLog.timestamp.desc()).limit(200)).all()
        tasks = session.exec(select(Task).where(Task.operator_id == body.operator_id, Task.status == 'completed')
                             .order_by(Task.finished_at.desc()).limit(100)).all()
        flags = analyze(logs, tasks)
        # Repeat-seatbelt coaching is restricted to the last seven days.
        recent = [r for r in logs if utc(r.timestamp) >= utcnow() - timedelta(days=7)]
        recent_belts = [f for f in analyze(recent, []) if f['kind'] == 'seatbelt']
        overruns = Counter(t.task_type for t in tasks if t.actual_time_min is not None and t.actual_time_min > t.estimated_time_min * 1.2)
        task_types = {t.task_id: t.task_type for t in tasks}
        flags = [f for f in flags if f['kind'] != 'seatbelt' and (f['kind'] != 'overrun' or overruns[task_types[f['evidence']['task_id']]] >= 2)] + recent_belts
        cohort = session.exec(select(MachineLog).where(MachineLog.data_source == body.source)
                              .order_by(MachineLog.timestamp.desc()).limit(2000)).all()
        ratios = sorted(r.idling_time_min / r.load_cycles for r in cohort if r.idling_time_min is not None and r.load_cycles is not None and r.load_cycles > 0)
        threshold = ratios[min(len(ratios) - 1, int(len(ratios) * .8))] if len(ratios) >= 5 else None
        filtered = []
        for flag in flags:
            if flag['kind'] == 'idle':
                cycles = flag['evidence'].get('load_cycles')
                if threshold is not None and cycles and flag['evidence']['idling_time_min'] / cycles < threshold:
                    continue
                basis = 'Top-fifth idle minutes per recorded cycle in the same-source cohort.' if threshold is not None and cycles else 'Too few comparable cycle records for percentile ranking; using the explicit 20-minute review threshold.'
                flag['reason'] += ' ' + basis
            filtered.append(flag)
        flags = filtered
        near_miss = session.exec(select(Incident).where(Incident.operator_id == body.operator_id, Incident.type == 'near_miss').order_by(Incident.created_at.desc())).first()
        if near_miss and near_miss.lat is not None and abs(near_miss.lat - 28.6692) < .001 and abs(near_miss.lng - 77.4538) < .001:
            flags.append({'kind': 'utility', 'reason': 'A reported near-miss has coordinates near the sample utility area; this is not verified utility proximity.', 'evidence': {'incident_id': near_miss.id}})
        # One current card per topic per request; stable evidence hashes prevent duplicate cards.
        selected = {}; existing = set(session.exec(select(Lesson.id).where(Lesson.operator_id == body.operator_id)).all())
        for flag in flags:
            selected.setdefault(flag['kind'], flag)
        candidates = [build_lesson(body.operator_id, flag) for flag in selected.values()]
    for lesson, details in candidates:
        if use_ai and os.getenv('GEMINI_API_KEY'):
            # Keep completed template quizzes immutable when enabling the provider.
            lesson.id += '-ai'
            details.id = lesson.id
        if lesson.id in existing:
            continue
        if use_ai:
            lesson, details = personalise(lesson, details)
        if lesson.id.endswith('-ai') and details.source != 'gemini_draft':
            # Do not permanently cache a provider outage under the AI cache key.
            provider_failed = True
            lesson.id = lesson.id[:-3]; details.id = lesson.id
        with Session(engine) as session:
            begin_write(session)
            if not session.get(Lesson, lesson.id):
                session.add(lesson); session.flush(); session.add(details); session.commit()
    with Session(engine) as session:
        return assigned(session, body.operator_id) | {'generation_notice':
            'AI provider unavailable or returned invalid content. Template lessons are available; try generation again later.' if provider_failed else ''}


def build_companion_router(engine):
    router = APIRouter(prefix='/api')

    @router.post('/predict-time')
    def prediction(body: PredictionInput):
        with Session(engine) as session:
            operator = require_operator(session, body.operator_id)
            machine = session.get(Machine, body.machine_id)
            if not machine: raise HTTPException(404, 'Machine not found')
            if operator.operator_skill not in ('beginner', 'intermediate', 'expert') or not 0 <= machine.machine_age_yrs <= 25:
                raise HTTPException(422, 'Profile is outside the synthetic model training range')
            return predict_time(body.task_type, body.weather, operator.operator_skill, machine.machine_age_yrs, body.estimated_time_min) | {
                'operator_skill': operator.operator_skill, 'machine_age_yrs': machine.machine_age_yrs}

    @router.get('/training/assigned')
    def lessons(operator_id: str):
        with Session(engine) as session: return assigned(session, operator_id)

    @router.post('/training/generate')
    def generate(body: GenerateInput):
        if not GENERATION_LOCK.acquire(blocking=False):
            raise HTTPException(409, 'Lesson generation is already in progress. Refresh in a moment.')
        try:
            return generate_lessons(engine, body)
        finally:
            GENERATION_LOCK.release()

    @router.post('/training/{lesson_id}/complete')
    def complete(lesson_id: str, body: QuizInput):
        with Session(engine) as session:
            begin_write(session)
            lesson = session.get(Lesson, lesson_id)
            if not lesson or lesson.operator_id != body.operator_id: raise HTTPException(404, 'Lesson not found for operator')
            payload = body.model_dump(mode='json') | {'lesson_id': lesson_id}
            identifier = 'quiz-' + str(body.request_id)
            receipt = session.get(SyncReceipt, identifier)
            if receipt:
                if receipt.payload != payload: raise HTTPException(409, 'Quiz request ID already used with different answers')
                return receipt.result
            if any(answer not in range(len(question['options'])) for answer, question in zip(body.answers, lesson.quiz)):
                raise HTTPException(422, 'Choose a valid answer to each question')
            score = round(100 * sum(a == q['answer'] for a, q in zip(body.answers, lesson.quiz)) / 3)
            row = Completion(id=identifier, operator_id=body.operator_id, lesson_id=lesson_id, score=score)
            result = {'saved': True, 'request_id': str(body.request_id), 'score': score, 'passed': score == 100,
                      'correct_answers': [q['answer'] for q in lesson.quiz], 'notice': 'Learning check recorded; operating skill is unchanged.'}
            session.add(row); session.add(SyncReceipt(id=identifier, payload=payload, result=result)); session.commit()
            return result

    @router.get('/utilities/near')
    def utilities(lat: float = Query(default=28.6692, ge=-90, le=90), lng: float = Query(default=77.4538, ge=-180, le=180)):
        return UTILITIES if abs(lat - 28.6692) < .05 and abs(lng - 77.4538) < .05 else {**UTILITIES, 'features': []}

    @router.get('/dashboard')
    def dashboard():
        with Session(engine) as session:
            people = session.exec(select(Operator)).all()
            tasks = session.exec(select(Task).where((Task.scheduled_date == site_today()) | (Task.status == 'in_progress'))).all()
            reports = session.exec(select(Incident).order_by(Incident.created_at.desc()).limit(30)).all()
            logs = session.exec(select(MachineLog).order_by(MachineLog.timestamp.desc()).limit(200)).all()
            completions = session.exec(select(Completion).order_by(Completion.completed_at.desc()).limit(30)).all()
            return {'generated_at': utcnow().isoformat(), 'date': site_today(), 'operators': [p.model_dump() for p in people],
                'tasks': [public_record(t) for t in tasks], 'incidents': [incident_summary(r) for r in reports],
                'logs': [public_record(r) for r in logs], 'completions': [public_record(c) for c in completions],
                'coverage': 'Today and carried-over tasks; latest 200 logs, 30 incidents and 30 training completions. Sources must be compared separately.'}

    @router.get('/handover')
    def handover(operator_id: str):
        with Session(engine) as session:
            require_operator(session, operator_id)
            tasks = session.exec(select(Task).where(Task.operator_id == operator_id, (Task.scheduled_date == site_today()) | (Task.status == 'in_progress'))).all()
            start = utcnow().astimezone(timezone(timedelta(hours=5, minutes=30))).replace(hour=0, minute=0, second=0, microsecond=0)
            incidents = session.exec(select(Incident).where(Incident.operator_id == operator_id, Incident.created_at >= start)).all()
            complete = sum(t.status == 'completed' for t in tasks); active = sum(t.status == 'in_progress' for t in tasks)
            return {'generated_at': utcnow().isoformat(), 'date': site_today(), 'completed_tasks': complete, 'active_tasks': active,
                'pending_tasks': sum(t.status == 'pending' for t in tasks), 'incidents': [incident_summary(r) for r in incidents],
                'fuel_remaining': None, 'fault_status': 'Unknown: no machine fault feed',
                'script_hi': f'आज {complete} काम पूरे हुए हैं। {active} काम जारी हैं। {len(incidents)} घटनाएँ दर्ज हैं। अगली टीम काम और घटना की जानकारी की समीक्षा करे। शेष ईंधन और मशीन की खराबी की जानकारी उपलब्ध नहीं है। साइट की अधिकृत शिफ्ट हस्तांतरण प्रक्रिया अपनाएँ।'}

    return router
