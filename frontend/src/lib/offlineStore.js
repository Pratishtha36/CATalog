import Dexie from 'dexie';

export function createOfflineStore(name = 'catalog-workspace-v1') {
  const db = new Dexie(name);
  db.version(1).stores({ packs: 'operator_id', queue: 'id,operator_id,created_at', lessons: 'operator_id' });
  let syncing;
  async function enqueue(row) {
    await db.transaction('rw', db.queue, async () => {
      const last = await db.queue.orderBy('created_at').last();
      await db.queue.add({ ...row, created_at: Math.max(Date.now(), (last?.created_at || 0) + 1) });
    });
  }
  return { db,
    async saveTask(payload) { await enqueue({ id: payload.id, operator_id: payload.operator_id, path: '/api/sync', payload }); },
    async saveQuiz(path, payload) { await enqueue({ id: payload.request_id, operator_id: payload.operator_id, path, payload }); },
    sync(send) {
      if (syncing) return syncing;
      syncing = (async () => {
        for (const row of await db.queue.orderBy('created_at').toArray()) {
          try {
            const receipt = await send(row.path, row.payload);
            if (receipt.saved !== true || (receipt.id || receipt.request_id) !== row.id) throw new Error('Server did not acknowledge the saved change.');
            await db.queue.delete(row.id);
          } catch (error) {
            await db.queue.update(row.id, { error: error.message });
            break; // Later finish events must never overtake a failed start.
          }
        }
      })().finally(() => { syncing = null; });
      return syncing;
    },
  };
}

export const offlineStore = createOfflineStore();

export function projectTasks(pack, queue) {
  const data = structuredClone(pack.data);
  for (const { payload: event, path } of queue) {
    if (path !== '/api/sync') continue;
    if (event.action === 'shift_start') data.shift ||= { id: event.id, started_at: event.occurred_at };
    const task = data.tasks.find(item => item.task_id === event.task_id);
    if (!task) continue;
    if (event.action === 'task_start') {
      task.status = 'in_progress'; task.started_at = event.occurred_at;
      if (event.pre_dig_acknowledged) task.pre_dig_acknowledged_at = event.occurred_at;
    }
    if (event.action === 'task_finish') {
      task.status = 'completed'; task.finished_at = event.occurred_at;
      task.actual_time_min = Math.max(0, (Date.parse(event.occurred_at) - Date.parse(task.started_at)) / 60000);
    }
    task.pending_sync = true;
  }
  return data;
}
