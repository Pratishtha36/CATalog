import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createIncidentStore, mergeReports } from '../src/lib/incidentStore.js';

const payload = () => ({ client_id: crypto.randomUUID(), operator_id: 'OP1001', machine_id: 'MC1001', type: 'near_miss',
  note: 'Demo report', photo: 'data:image/png;base64,fixture', created_at: new Date().toISOString(), lat: null, lng: null });

test('offline report including photo survives reopen and only a matching receipt marks it synced', async () => {
  const name = `incident-test-${crypto.randomUUID()}`;
  let store = createIncidentStore(name);
  const body = payload();
  await store.save(body);
  store.db.close();
  store = createIncidentStore(name);
  try {
    assert.equal((await store.db.reports.get(body.client_id)).photo, body.photo);
    await store.sync(async () => { throw new Error('Offline'); });
    assert.equal((await store.db.reports.get(body.client_id)).status, 'pending');
    await store.sync(async () => ({ client_id: 'wrong', saved: true }));
    assert.equal((await store.db.reports.get(body.client_id)).status, 'pending');
    await store.sync(async sent => { assert.deepEqual(sent, body); return { client_id: body.client_id, saved: true, duplicate: true }; });
    const saved = await store.db.reports.get(body.client_id);
    assert.equal(saved.status, 'synced');
    assert.equal(saved.syncError, '');
    assert.equal(saved.photo, body.photo);
  } finally { await store.db.delete(); }
});

test('concurrent sync calls share one upload and a rejected report does not block another', async () => {
  const store = createIncidentStore(`incident-test-${crypto.randomUUID()}`);
  const a = payload(), b = payload();
  try {
    await store.save(a); await store.save(b);
    let calls = 0;
    const send = async body => { calls++; if (body.client_id === a.client_id) throw new Error('Validation failed'); return { client_id: body.client_id, saved: true }; };
    await Promise.all([store.sync(send), store.sync(send)]);
    assert.equal(calls, 2);
    assert.equal((await store.db.reports.get(a.client_id)).status, 'pending');
    assert.equal((await store.db.reports.get(b.client_id)).status, 'synced');
  } finally { await store.db.delete(); }
});

test('server history and local photo cache display each report once', () => {
  const body = payload();
  const rows = mergeReports([{ ...body, status: 'synced' }], [{ ...body, photo: undefined, has_photo: true }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].photo, body.photo);
});
