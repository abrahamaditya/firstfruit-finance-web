import { Repository, DataRepositories } from '../../core/ports/repositories';

// Firestore implementation of the repository ports. This is the ONLY place that
// imports the Firebase SDK — domain/application never see it (arch §2). Each method
// maps a collection to the generic CRUD contract. Uncomment after `npm install firebase`
// and wiring client.ts, then set NEXT_PUBLIC_REPOSITORY_DRIVER=firebase.
/*
import { db } from './client';
import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, where,
} from 'firebase/firestore';

function firestoreRepo<T extends { id: string }>(name: string): Repository<T> {
  const col = collection(db, name);
  return {
    async list() { const s = await getDocs(col); return s.docs.map(d => ({ id: d.id, ...d.data() } as T)); },
    async get(id) { const d = await getDoc(doc(col, id)); return d.exists() ? ({ id: d.id, ...d.data() } as T) : null; },
    async create(item) { const ref = await addDoc(col, item as any); return { ...(item as any), id: ref.id } as T; },
    async update(id, patch) { await updateDoc(doc(col, id), patch as any); return (await this.get(id))!; },
    async remove(id) { await deleteDoc(doc(col, id)); },
  };
}

export function createFirestoreRepositories(): DataRepositories {
  return {
    wallets: firestoreRepo('wallets'),
    transactions: firestoreRepo('transactions'),
    budgets: firestoreRepo('budgets'),
    periods: firestoreRepo('periods'),
    subscriptions: firestoreRepo('subscriptions'),
    receivables: firestoreRepo('receivables'),
    plans: firestoreRepo('plans'),
    savings: firestoreRepo('savings'),
    reminders: firestoreRepo('reminders'),
    beneficiaries: firestoreRepo('beneficiaries'),
  };
}
*/
export function createFirestoreRepositories(): never {
  throw new Error('Firestore repositories belum diaktifkan. Lihat infrastructure/firebase/repositories.ts');
}
