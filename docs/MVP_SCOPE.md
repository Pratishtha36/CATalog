# CabWise MVP scope

## Objective
Demonstrate an affordable Hindi-speaking operator companion for older construction equipment, using a phone for basic activity observations and an operator-to-supervisor workflow.

## Foundation: steps 1 and 2
- Agree the scope and one four-minute demonstration journey.
- Scaffold React, Vite, Tailwind, React Router, and FastAPI.
- Connect the frontend to a backend health endpoint.
- Provide responsive navigation and clearly labelled placeholder module screens.
- Provide explicit, tap-to-run checks for motion, location, and Hindi speech.
- Prepare environment examples and Vercel/Render deployment configuration.
- Verify the production build and backend locally. Public deployment and physical-phone checks require the deployment accounts and demo device.

## Persistence and tasks: steps 3 and 4
- Persistent SQLite/SQLModel tables, explicit source labels, nullable unknown telemetry, and idempotent fixtures.
- OP1001/MC1001 demo profile, three tasks per site day, and historical sample machine data.
- Persisted start shift, task start/finish timestamps, actual duration, and one active task per operator/machine.
- Demo pre-dig acknowledgement before trenching/excavation begins.
- Sample seatbelt replay with Hindi/visual alerts, never represented as live telemetry.

Authentication, machine ECU telemetry, utility proximity, offline task updates, and lesson generation remain unimplemented. Lesson/completion tables are schema preparation only. Incident reporting and its offline queue are now implemented.

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
Shift handover, Isolation Forest, advanced fleet charts, real authentication, production integrations, and subscriptions. Offline support remains in the target MVP but is not part of steps 1-4.

## Stack decisions
React + Vite + React Router + Tailwind; FastAPI. SQLite/SQLModel is implemented. Dexie and scikit-learn are implemented for motion storage/training. Leaflet/Turf, Recharts, and a server-side LLM integration remain future additions. Browser DeviceMotion, Geolocation, and SpeechSynthesis power the readiness checks. Vercel and Render are deployment targets.

## Current milestone: steps 5 and 6
- Phone acceleration/rotation capture with explicit permission, gap handling, foreground-only capture, observed sample rate, and rule-based activity estimates.
- Debounced cycle counting; idle inferred only when the operator confirms engine-running. Phone motion cannot distinguish engine-off from idle by itself.
- Clearly labelled laptop simulator, local motion checkpoints/queue, and idempotent machine-log ingestion.
- Manually labelled raw recordings, CSV export, Random Forest training, grouped evaluation, local JSON forest inference and rules fallback.
- A synthetic-only trained demonstration model, excluded from phone inference. Real phone recording collection and field validation require the demo device and remain outstanding.

## Current milestone: operational insights and incident reporting
Explainable rules with source-separated machine data, evidence, record coverage, and task overruns. Incident/near-miss/unsafe-condition forms with optional photo, durable local saving, cross-route background sync, exact-retry protection, and server history/photo retrieval. See INSIGHTS_INCIDENTS_MANUAL_CHECKS.md.
