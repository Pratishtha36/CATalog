import Dexie from 'dexie';

export function createIncidentStore(name = 'catalog-incidents-v1') {
  const db = new Dexie(name);
  db.version(1).stores({ reports: 'client_id,operator_id,status,created_at', cache: 'operator_id' });
  let syncing = null;
  return {
    db,
    async save(payload) {
      await db.reports.add({ ...structuredClone(payload), status: 'pending', syncError: '' });
    },
    sync(send) {
      if (syncing) return syncing;
      syncing = (async () => {
        let saved = 0;
        for (const row of await db.reports.where('status').equals('pending').toArray()) {
          const { status, syncError, ...payload } = row;
          try {
            const receipt = await send(payload);
            if (receipt.client_id !== row.client_id || receipt.saved !== true) throw new Error('Server did not acknowledge this report.');
            await db.reports.update(row.client_id, { status: 'synced', syncError: '' });
            saved++;
          } catch (error) {
            await db.reports.update(row.client_id, { syncError: error.message });
          }
        }
        return saved;
      })().finally(() => { syncing = null; });
      return syncing;
    },
  };
}

export function mergeReports(local, remote) {
  const merged = new Map(remote.map(row => [row.client_id, { ...row, status: 'synced' }]));
  for (const row of local) merged.set(row.client_id, { ...merged.get(row.client_id), ...row });
  return [...merged.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export const incidentStore = createIncidentStore();

export async function preparePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Choose an image smaller than 15 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const photo = canvas.toDataURL('image/jpeg', .8);
    if (photo.length > 2796200) throw new Error('Photo is too large after compression. Choose a smaller image.');
    return photo;
  } finally { bitmap.close(); }
}
