# CabWise MVP scope

## Objective
Demonstrate an affordable Hindi-speaking operator companion for older construction equipment, using a phone for basic activity observations and an operator-to-supervisor workflow.

## Current milestone: steps 1 and 2 only
- Agree the scope and one four-minute demonstration journey.
- Scaffold React, Vite, Tailwind, React Router, and FastAPI.
- Connect the frontend to a backend health endpoint.
- Provide responsive navigation and clearly labelled placeholder module screens.
- Provide explicit, tap-to-run checks for motion, location, and Hindi speech.
- Prepare environment examples and Vercel/Render deployment configuration.
- Verify the production build and backend locally. Public deployment and physical-phone checks require the deployment accounts and demo device.

No tasks database, authentication, real telemetry, safety engine, incident storage, offline sync, lesson generator, or ML model is implemented in this milestone.

## Target MVP (future milestones)
| Feature | Acceptance criterion |
| --- | --- |
| My Day | OP1001 sees three tasks and can start/finish one; timestamps persist. |
| SwingSense | Real phone observations update estimated activity and cycle counts; sources are labelled; rules remain available as a fallback. |
| Safety | Replayed seatbelt data triggers one Hindi alert on transition. |
| DigSafe | Sample mapped utility lines produce proximity warnings; simulated location is explicitly labelled. |
| Incident reports | A report with a photo survives offline refresh and syncs exactly once on reconnection. |
| Insights | Seeded idle, fuel-per-cycle, and repeated seatbelt issues display the supporting values. |
| CoachCard | An insight produces a cached Hindi lesson and quiz; completion records training progress. |
| Time estimates | A task receives a duration estimate and an uncertainty range; synthetic-data evaluation is labelled. |
| Supervisor | Task updates, incidents, recent alerts, and training completions appear with freshness timestamps. |

## Demo fixture and journey
One operator (OP1001), one older excavator, one sample worksite, and three tasks. No claim of authenticated identity in the prototype.

1. Open My Day and begin a trenching task.
2. Move the phone; show activity observations and estimated work cycles.
3. Replay a seatbelt violation and hear the Hindi alert.
4. Move the simulated position toward a mapped sample utility and see escalating warnings.
5. Disconnect, record an incident, reconnect, and show one synced record.
6. Open the 55-minute-idling / two-cycle insight and play the personalised Hindi lesson.
7. Complete the quiz, show training progress, and request a task estimate.
8. Show the corresponding supervisor updates.

The fixture is a future demonstration, not current functionality. Accelerated elapsed time, synthetic data, and replayed telemetry must be visible as demo modes.

## Data and product boundaries
- Phone motion does not measure fuel consumption or seatbelt status. Missing values remain unknown.
- Mapped-utility proximity does not detect cables, track the bucket, establish safe clearance, or control E-Fence.
- Hand-movement classifier results do not establish excavator accuracy.
- Synthetic task data is suitable for pipeline demonstration, not real-world accuracy claims.
- A passed quiz records training progress; it does not automatically establish operating skill or reduce task duration.
- The first milestone stores or uploads no location or motion data.

## Deferred
Shift handover, Isolation Forest, advanced fleet charts, real authentication, production integrations, and subscriptions. Offline support remains in the target MVP but is not part of steps 1 and 2.

## Stack decisions
React + Vite + React Router + Tailwind; FastAPI. SQLite/SQLModel, Dexie, Leaflet/Turf, Recharts, pandas/scikit-learn/joblib, and a server-side LLM integration will be added only when their features begin. Browser DeviceMotion, Geolocation, and SpeechSynthesis power the readiness checks. Vercel and Render are deployment targets.
