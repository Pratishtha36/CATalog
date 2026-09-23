import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMotionStore, recordingsCsv } from '../src/lib/motionStore.js';

function payload(id = crypto.randomUUID()) { return { id, observed_seconds: 10, idle_seconds: 3, source: 'phone' }; }

test('draft observations survive reopening and recover once into the queue', async () => {
  const name = `test-${crypto.randomUUID()}`;
  const first = createMotionStore(name);
  const row = payload();
  await first.saveDraft(row, 'tab-one');
  first.db.close();
  const reopened = createMotionStore(name);
  await reopened.recover('other-tab');
  assert.equal(await reopened.db.queue.count(), 0);
  await reopened.recover('tab-one');
  await reopened.recover('tab-one');
  assert.equal(await reopened.db.queue.count(), 1);
  assert.deepEqual((await reopened.db.queue.get(row.id)).payload, row);
  await reopened.db.delete();
});

test('failed uploads retain the exact row for retry; only matching receipts remove it', async () => {
  const store = createMotionStore(`test-${crypto.randomUUID()}`);
  const row = payload();
  await store.finalize(row);
  await assert.rejects(store.sync(async () => { throw new Error('offline'); }), /offline/);
  assert.equal(await store.db.queue.count(), 1);
  await assert.rejects(store.sync(async () => ({ id: 'wrong', saved: true })), /acknowledge/);
  assert.equal(await store.db.queue.count(), 1);
  let sent;
  await store.sync(async data => { sent = data; return { id: data.id, saved: true, duplicate: true }; });
  assert.deepEqual(sent, row);
  assert.equal(await store.db.queue.count(), 0);
  await store.db.delete();
});

test('concurrent sync requests share one in-flight operation', async () => {
  const store = createMotionStore(`test-${crypto.randomUUID()}`);
  await store.finalize(payload());
  let calls = 0;
  const send = async row => { calls++; return { id: row.id, saved: true }; };
  const a = store.sync(send), b = store.sync(send);
  assert.equal(a, b);
  await Promise.all([a,b]);
  assert.equal(calls, 1);
  await store.db.delete();
});

test('CSV retains recording groups, labels, source and every raw axis', () => {
  const csv = recordingsCsv([{id: 'take-1',label:'idle',source:'phone',samples:[{t:0,ax:1,ay:2,az:3,gx:4,gy:5,gz:6}]}]);
  assert.ok(csv.startsWith('recording_id,label,source,t,ax,ay,az,gx,gy,gz'));
  assert.ok(csv.includes('"take-1","idle","phone","0","1","2","3","4","5","6"'));
});
