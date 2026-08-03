self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'FirstFruit Finance';
  const options = {
    body: payload.body || 'Ada pembaruan keuangan untukmu.',
    icon: payload.icon || '/icons/pwa-192x192.png',
    badge: payload.badge || '/icons/pwa-192x192.png',
    tag: payload.tag || 'firstfruit-notification',
    renotify: Boolean(payload.renotify),
    data: { url: payload.url || '/' },
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    if ('setAppBadge' in self.navigator && Number.isFinite(payload.badgeCount)) {
      await self.navigator.setAppBadge(payload.badgeCount);
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      if ('navigate' in existing) await existing.navigate(targetUrl);
      return;
    }
    await self.clients.openWindow(targetUrl);
  })());
});
