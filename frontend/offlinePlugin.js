import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export function offlinePlugin() {
  return { name: 'catalog-offline-shell', apply: 'build', generateBundle(_, bundle) {
    function files(directory, prefix = '') {
      return readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory()
        ? files(join(directory, item.name), `${prefix}${item.name}/`) : [`/${prefix}${item.name}`]);
    }
    const publicFiles = files('public');
    const assets = [...Object.keys(bundle).map(name => `/${name}`), ...publicFiles];
    if (!assets.includes('/index.html')) assets.push('/index.html');
    const hash = createHash('sha256').update(JSON.stringify(assets));
    for (const path of publicFiles) hash.update(readFileSync(join('public', path.slice(1))));
    const version = hash.digest('hex').slice(0, 12);
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = 'catalog-shell-${version}';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith('catalog-shell-') && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then(cache => cache.match('/index.html'))));
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
  }
});` });
  } };
}
