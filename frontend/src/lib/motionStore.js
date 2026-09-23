import Dexie from 'dexie';

export function createMotionStore(name = 'cabwise-motion-v1') {
  const db = new Dexie(name);
  db.version(1).stores({ queue: 'id,createdAt', drafts: 'id,tabId', recordings: 'id,source,label,createdAt', settings: 'key' });
  let syncPromise = null;
  return {
    db,
    async saveDraft(payload, tabId) {
      if (payload.observed_seconds > 0) await db.drafts.put({ id: payload.id, tabId, payload, createdAt: Date.now() });
    },
    async finalize(payload) {
      if (!(payload.observed_seconds > 0)) return;
      await db.transaction('rw', db.queue, db.drafts, async () => {
        await db.queue.put({ id: payload.id, payload, createdAt: Date.now() });
        await db.drafts.delete(payload.id);
      });
    },
    async recover(tabId) {
      await db.transaction('rw', db.queue, db.drafts, async () => {
        for (const item of await db.drafts.where('tabId').equals(tabId).toArray()) {
          if (!await db.queue.get(item.id)) await db.queue.put({ id: item.id, payload: item.payload, createdAt: item.createdAt });
          await db.drafts.delete(item.id);
        }
      });
    },
    sync(send) {
      if (syncPromise) return syncPromise;
      syncPromise = (async () => {
        let count = 0;
        for (const item of await db.queue.orderBy('createdAt').toArray()) {
          const response = await send(item.payload);
          if (response.id !== item.id || response.saved !== true) throw new Error('Server did not acknowledge the motion row. It remains queued.');
          await db.queue.delete(item.id);
          count++;
        }
        return count;
      })().finally(() => { syncPromise = null; });
      return syncPromise;
    },
  };
}

export function recordingsCsv(recordings) {
  const header = ['recording_id', 'label', 'source', 't', 'ax', 'ay', 'az', 'gx', 'gy', 'gz'];
  const rows = [header.join(',')];
  const quote = value => `"${String(value).replaceAll('"', '""')}"`;
  for (const recording of recordings) {
    for (const sample of recording.samples) rows.push([recording.id, recording.label, recording.source, ...header.slice(3).map(key => sample[key])].map(quote).join(','));
  }
  return rows.join('\n');
}
