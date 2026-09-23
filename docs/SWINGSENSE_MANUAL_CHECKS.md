# Steps 5 and 6: manual checks

Open http://localhost:5173, choose OP1001, and start a shift in My Day. Then open SwingSense at `/live`. Keep the page in the foreground during capture.

## Windows laptop checks

1. **Activity estimates:** choose Laptop simulator (synthetic), Threshold rules, and Start capture. Hold each action for 5 seconds. Expect stationary/idle, dig, swing, and travel estimates, an updating graph, sample count, and measured sample rate.
2. **Cycle counting:** hold dig, swing, then dig for at least 5 seconds each. Expect one estimated cycle. Repeating dig alone should not keep adding cycles. Travel or idle between swing and dig should break the sequence.
3. **Idle confirmation:** without engine confirmation, stationary motion must not add idle time. Stop, confirm the simulated engine is running, restart, and leave the simulator on idle. Idle seconds increase and a clearly labelled demo warning appears after 10 continuous estimated idle seconds. Phone mode uses 20 minutes.
4. **Saved observations:** press Stop & save after at least 5 seconds. Expand the latest observation. Cycles and idle are estimates; fuel, engine hours, and seatbelt values remain null. With the API running, the queue should drain. Inspect http://localhost:5173/api/motion/recent?operator_id=OP1001 for the saved batch and its `simulation` source.
5. **Offline retry:** open Chrome DevTools on this page, select Network > Offline, then capture and stop. The queue should retain the batch and show a pending-sync message. Select No throttling and press Sync now. The queue should drain. Repeated Sync now clicks must not add duplicate IDs in the recent endpoint. Turning off Wi-Fi alone may not block localhost.
6. **Recovery:** while offline, capture for 10 seconds and reload this same tab before pressing Stop. The latest completed-window draft should recover into the queue. Return online and sync. A partial unfinished window or unfinished raw recording may be lost on abrupt closure.
7. **Raw recording export:** while simulating, choose an action and press Record labelled take. Wait 15 seconds; repeat for another action. Export CSV. Check recording IDs, labels, `simulation` source, timestamps, and six sensor axes. Reload: completed takes remain. Synthetic takes do not enable Train phone classifier.
8. **Random Forest:** stop capture, select Random Forest + rules fallback, and restart the simulator. Exercise all four actions. Expect Random Forest as the prediction method and a model vote share. Review the synthetic evaluation table and the disjoint training/test recording IDs. These results measure generated signals only.
9. **Missing sensors:** stop, select Phone sensors, and start. On a laptop without motion readings, expect a helpful error after about 8 seconds, without fabricated readings.
10. **Lifecycle:** switch browser tabs or navigate away during capture. Capture should stop and completed observations should be saved. Returning to SwingSense requires pressing Start capture again.

## Real-phone training check

This requires a sensor-capable phone and an HTTPS URL; a phone's localhost refers to the phone, not the Windows laptop. Plain LAN HTTP does not provide the required secure sensor context.

1. Open the app over HTTPS and start a shift. Choose Phone sensors and grant motion permission.
2. Record separate 15-second takes for idle (still), dig (shaking), swing (rotation), and travel (walking), keeping orientation consistent. Use at least 3 takes per class, preferably 10–15 minutes of varied recordings.
3. Stop capture and press Train phone classifier. Expect a saved phone model and accuracy, precision, recall, F1, confusion matrix, and whole-recording split details.
4. Select Random Forest and capture fresh movements. Compare estimates with your actions. Poor or unavailable model predictions fall back to rules.
5. Reload and verify the saved model is available. Once loaded/cached, local prediction continues with the already-open app offline; observations queue for later sync.

The coding environment has not collected real phone recordings or validated excavator accuracy. The bundled forest is deliberately restricted to the simulator. Full offline application loading is outside these steps.
