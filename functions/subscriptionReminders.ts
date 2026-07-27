/**
 * Scheduled Cloud Function — subscription reminders (arch §5.3).
 * Runs daily; finds subscriptions due for a billing reminder or ending soon,
 * writes notification docs, then dispatches FCM web push. REMINDER-ONLY (no auto-charge).
 *
 * Deploy under your Firebase Functions project. Pseudocode + real structure below;
 * uncomment after installing firebase-admin + firebase-functions.
 */
import { isReminderDue, isEndingSoon } from '../src/core/domain/subscription';
import { Subscription } from '../src/core/domain/types';

// import * as functions from 'firebase-functions';
// import * as admin from 'firebase-admin';
// admin.initializeApp();
// const db = admin.firestore();

export async function runSubscriptionReminders(allSubs: Subscription[], today = new Date()) {
  const notifications: { ownerId?: string; type: string; title: string; body: string; relatedId: string }[] = [];
  for (const s of allSubs) {
    if (s.status !== 'active') continue;
    if (isReminderDue(s, today)) {
      notifications.push({ type: 'subscription_renewal', title: `${s.name} akan ditagih`, body: `Tagihan dalam ${s.reminderDaysBefore} hari.`, relatedId: s.id });
    }
    if (isEndingSoon(s, 14, today)) {
      notifications.push({ type: 'subscription_ending', title: `${s.name} akan berakhir`, body: 'Pertimbangkan perpanjangan.', relatedId: s.id });
    }
  }
  // for (const n of notifications) await db.collection('notifications').add({ ...n, isRead: false, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  // dispatchNotification trigger then sends FCM push to users.fcmTokens
  return notifications;
}

// export const subscriptionReminders = functions.pubsub.schedule('every day 07:00').timeZone('Asia/Jakarta')
//   .onRun(async () => { const snap = await db.collection('subscriptions').where('status','==','active').get();
//     const subs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Subscription[]; await runSubscriptionReminders(subs); });
