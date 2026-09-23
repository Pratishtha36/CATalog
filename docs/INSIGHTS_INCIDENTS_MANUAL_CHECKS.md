# Insights and incident reporting

## Implemented

- `/insights`: rules-based evidence cards for >20 minutes recorded idle, >1.5 L per cycle, two or more observed unfastened seatbelt episodes, and >20% completed-task overrun.
- Select a machine-log source explicitly: historical demo fixture, sample replay, phone estimate, or simulation. Task overruns are reviewed independently for the operator, with their source displayed in evidence.
- The analysis covers at most the latest 200 records for that source and 100 completed tasks. The observed timestamp range and measurement coverage are displayed. These are demonstration thresholds, not calibrated machine safety limits.
- Phone/simulator batches may accumulate >20 idle minutes across records; the card explicitly does not claim continuous idle. Unknown fuel, zero-cycle fuel ratios, and missing seatbelt readings do not become fabricated measurements.
- `/incidents`: incident, near-miss, and unsafe-condition reports with notes and optional photo. A saved report is persisted locally before upload. It remains locally available after sync, including its attached photo.
- Photo input accepts JPEG/PNG/WebP, resizes to at most 1600 pixels, and exports JPEG through canvas (without original file metadata). Input limit is 15 MB; stored photo limit is 2 MB. The API accepts validated JPEG/PNG data URLs. Location is not collected by the form.
- Incident sync runs while the app is open, including after changing routes: on startup, reconnection, every 15 seconds, and via Sync now. Exact retries reuse the same client ID. A conflicting payload under the same ID is rejected.
- The existing SQLite incidents table stores the record and photo atomically, so no database migration or separate upload directory is required for this demo.

## Local checks

1. Open `/insights` and select Historical demo fixture. The seeded 55-minute idle / 2-cycle / 3.8-litre record should produce idle and fuel cards. Expand the evidence.
2. Choose Phone estimates. Simulator/fixture records must not appear as phone data. Missing fuel should show zero eligible records, not a zero fuel-consumption claim.
3. In Safety, replay unfastened, fastened, then unfastened again. Choose Seatbelt sample replay in Insights and refresh. Repeated snapshots of the same state alone must not add episodes.
4. Open Safety > Report an incident (or Incident reports in navigation). Write a demo note, attach a small image, and save. Expect a local-save acknowledgement followed by Synced when connected.
5. Use Chrome DevTools > Network > Offline on the incident page. Save another report with a photo. Expect Saved locally · Pending. Refresh this same localhost origin; the saved report/photo should remain if the app can reload. Full offline app-shell caching is not implemented, so if offline reload cannot load the page, restore the connection to load it; the saved data remains in IndexedDB.
6. Restore No throttling. The pending report should sync automatically within 15 seconds. Pressing Sync now repeatedly must not create duplicates. Server history is available at `/api/incidents?operator_id=OP1001`.
7. Save a report offline, navigate to My Day, and reconnect. Return to Incident reports after 15 seconds to verify background sync across routes.
8. Stop/restart the API and verify server reports/photos remain. Refreshing the browser does not clear locally saved reports.

Only submitted reports are persisted. An unsaved note or photo selection can be lost on navigation/refresh. Clearing browser data can remove unsynced reports. Same-origin storage means localhost and 127.0.0.1 have separate queues; use one consistently. No notifications, emergency dispatch, authentication, or production access controls are implemented.

## API

- `GET /api/insights?operator_id=OP1001&source=demo_fixture`
- `POST /api/incidents` (JSON; client UUID, operator/machine, category, note, aware timestamp, optional image and coordinates)
- `GET /api/incidents?operator_id=OP1001` (latest 50 summaries; photo bytes excluded)
- `GET /api/incidents/{id}/photo`

Automated verification covers source/unknown-value handling, seatbelt episode counting, idle batch totals, validation, concurrent retries, restart persistence, photo retrieval, local storage recovery, sync acknowledgement, and report merging. Browser camera capture and rendered/mobile interaction still require a connected device.
