import { getBrowserSupabase } from '../infrastructure/supabase/browser';

// Public VAPID key; pasangan private-nya hanya disimpan sebagai Supabase secret.
const VAPID_PUBLIC_KEY = 'BH-bvUXbHch2X2xFRB5N8uf4t0L_vt9uug2_eQhDIONztFXNkM3IMBoM5uG98J9uZhJzZzyzvszaKoUALCwMAIQ';

export type WebPushState = 'unsupported' | 'disabled' | 'enabled' | 'denied';

const applicationServerKey = () => {
  const padding = '='.repeat((4 - (VAPID_PUBLIC_KEY.length % 4)) % 4);
  const base64 = (VAPID_PUBLIC_KEY + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
};

const supported = () =>
  typeof window !== 'undefined'
  && 'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window;

export async function webPushState(): Promise<WebPushState> {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const registration = await navigator.serviceWorker.register('/sw.js');
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? 'enabled' : 'disabled';
}

export async function enableWebPush(workspaceId: string): Promise<void> {
  if (!supported()) {
    throw new Error('Push notification belum didukung. Di iPhone/iPad, pasang PWA ke Home Screen terlebih dahulu.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Izin notifikasi tidak diberikan.');

  const registration = await navigator.serviceWorker.register('/sw.js');
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(),
  });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('Browser tidak memberikan data subscription yang lengkap.');
  }

  const { error } = await getBrowserSupabase().rpc('upsert_web_push_subscription', {
    p_workspace_id: workspaceId,
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_user_agent: navigator.userAgent.slice(0, 500),
  });
  if (error) {
    if (!existing) await subscription.unsubscribe();
    throw new Error(`Gagal menyimpan push perangkat: ${error.message}`);
  }
}

export async function disableWebPush(): Promise<void> {
  if (!supported()) return;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const { error } = await getBrowserSupabase().from('web_push_subscriptions')
    .delete()
    .eq('endpoint', subscription.endpoint);
  if (error) throw new Error(`Gagal menonaktifkan push perangkat: ${error.message}`);
  await subscription.unsubscribe();
}
