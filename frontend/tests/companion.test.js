import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfflineStore, projectTasks } from '../src/lib/offlineStore.js';
import { coordinates, nearestUtility, proximityLevel, segmentDistance } from '../src/lib/geo.js';
import { readFileSync, statSync } from 'node:fs';

test('all five Hindi topic lessons and fifteen quiz clips are bundled', () => {
  const root = new URL('../public/audio/coach/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
  for (const topic of ['idle', 'fuel', 'seatbelt', 'overrun', 'utility']) {
    for (const name of [topic, ...[0, 1, 2].map(i => `${topic}-quiz-${i}`)]) {
      assert.equal(statSync(new URL(`${name}.mp3`, root)).size, manifest[name].bytes);
      assert.ok(manifest[name].duration_seconds > 5);
    }
  }
});

test('proximity measures line segments, not just vertices, and has explicit thresholds', () => {
  assert.equal(segmentDistance([5, 5], [0, 0], [10, 0]), 5);
  assert.equal(segmentDistance([3, 4], [0, 0], [0, 0]), 5);
  const nearest = nearestUtility(coordinates([10, 0]), [{ geometry: { coordinates: [coordinates([0, -50]), coordinates([0, 50])] } }]);
  assert.ok(Math.abs(nearest.distance - 10) < .001);
  assert.equal(proximityLevel(5), 'stop'); assert.equal(proximityLevel(10), 'warning');
  assert.equal(proximityLevel(20), 'caution'); assert.equal(proximityLevel(21), 'outside');
  assert.equal(nearestUtility([0, 0], []), null);
});

test('task events survive reopen, preserve order and do not drop an unacknowledged event', async () => {
  const name = 'test-offline-' + crypto.randomUUID(); const first = createOfflineStore(name);
  const base = { operator_id: 'OP1001', task_id: 'T1', occurred_at: '2026-09-24T08:00:00Z' };
  await first.saveTask({ ...base, id: 'start', action: 'task_start' });
  await first.saveTask({ ...base, id: 'finish', action: 'task_finish', occurred_at: '2026-09-24T08:05:00Z' });
  first.db.close(); const store = createOfflineStore(name);
  let calls = 0;
  await store.sync(async () => { calls++; return { saved: true, id: 'wrong' }; });
  assert.equal(calls, 1); assert.equal(await store.db.queue.count(), 2);
  const pack = { data: { tasks: [{ task_id: 'T1', status: 'pending' }] } };
  const data = projectTasks(pack, await store.db.queue.orderBy('created_at').toArray());
  assert.equal(data.tasks[0].status, 'completed'); assert.equal(data.tasks[0].actual_time_min, 5);
  assert.equal(pack.data.tasks[0].status, 'pending');
  const sent = [];
  const send = async (_, row) => { sent.push(row.id); return { id: row.id, saved: true }; };
  await Promise.all([store.sync(send), store.sync(send)]);
  assert.deepEqual(sent, ['start', 'finish']); assert.equal(await store.db.queue.count(), 0);
  await store.db.delete();
});

test('offline quiz answers are retained until their own server receipt arrives', async () => {
  const store = createOfflineStore('quiz-' + crypto.randomUUID());
  const payload = { request_id: 'quiz-1', operator_id: 'OP1001', answers: [0, 1, 2] };
  await store.saveQuiz('/api/training/lesson/complete', payload);
  await store.sync(async () => { throw new Error('Offline'); });
  assert.equal(await store.db.queue.count(), 1);
  await store.sync(async (path, body) => {
    assert.equal(path, '/api/training/lesson/complete'); assert.deepEqual(body.answers, [0, 1, 2]);
    return { saved: true, request_id: body.request_id, score: 100 };
  });
  assert.equal(await store.db.queue.count(), 0); await store.db.delete();
});
