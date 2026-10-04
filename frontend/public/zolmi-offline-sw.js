/* Owner website documents and static assets only. API/auth/admin responses never
   enter CacheStorage. Private records belong to the account-scoped encrypted DB. */
const SHELL = 'zolmi-owner-shell-v1';
const ASSETS = 'zolmi-owner-assets-v1';
const IMAGES = 'zolmi-owner-public-images-v1';
const PAGES = ['/', '/bookings', '/clients', '/staff', '/team', '/inventory', '/services', '/reviews', '/analytics', '/settings', '/settings/payments', '/settings/branding', '/settings/sms'];
const eligiblePage = url => url.origin === self.location.origin && PAGES.includes(url.pathname) && !url.search;
async function saveDocument(path) {
  const response = await fetch(path, { credentials: 'omit', cache: 'reload' });
  if (!response.ok || response.redirected || !response.headers.get('content-type')?.includes('text/html')) return;
  const html = await response.clone().text();
  const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?#]+(?:\?[^"#]*)?)"/g)].map(match => match[1]);
  const cache = await caches.open(ASSETS);
  await Promise.all([...new Set(assets)].map(async asset => {
    try { const file = await fetch(asset, { credentials: 'omit' }); if (file.ok) await cache.put(asset, file); } catch { /* A page is committed only once all its required assets are present. */ }
  }));
  if ((await Promise.all(assets.map(asset => cache.match(asset)))).every(Boolean)) await (await caches.open(SHELL)).put(path, response);
}
self.addEventListener('install', event => {
  // Warm every owner page, rather than requiring a visit to each page first.
  event.waitUntil((async () => { for (const path of PAGES) { try { await saveDocument(path); } catch {} } })());
});
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('message', event => {
  if (event.data === 'CLEAR_OWNER_DATA') event.waitUntil(Promise.all([caches.delete(SHELL), caches.delete(ASSETS), caches.delete(IMAGES)]));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  // Only explicitly public Cloudinary image deliveries. Private payment/ID
  // documents and arbitrary external URLs must never enter this cache.
  if (request.method === 'GET' && url.hostname === 'res.cloudinary.com' && /^\/[^/]+\/image\/upload\//.test(url.pathname)) {
    event.respondWith((async () => {
      const client = event.clientId ? await self.clients.get(event.clientId) : null;
      if (!client || !eligiblePage(new URL(client.url)) || /id[-_]?cards?|receipts?|screenshots?|payments?|private/i.test(url.pathname)) return fetch(request);
      const cache = await caches.open(IMAGES); const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok || response.type === 'opaque') {
        await cache.put(request, response.clone());
        const keys = await cache.keys(); for (const key of keys.slice(0, Math.max(0, keys.length - 80))) await cache.delete(key);
      }
      return response;
    })());
    return;
  }
  if (request.method !== 'GET' || url.origin !== self.location.origin || /^\/(api|admin|auth|uploads)(\/|$)/.test(url.pathname)) return;
  if (request.mode === 'navigate' && eligiblePage(url)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        // Online documents are deliberately not cached with account cookies.
        // The anonymous, owner-only application shell is warmed separately.
        if (response.ok) event.waitUntil(saveDocument(url.pathname).catch(() => undefined));
        if (response.status < 500) return response;
      } catch {}
      const cached = await (await caches.open(SHELL)).match(url.pathname);
      return cached || new Response('<!doctype html><html><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;padding:40px;color:#334155"><h1>Connect once to prepare this page</h1><p>This page has not finished downloading for offline use.</p><a href="/">Return to dashboard</a></body></html>', { status: 503, headers: { 'Content-Type': 'text/html' } });
    })());
  } else if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSETS); const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});
