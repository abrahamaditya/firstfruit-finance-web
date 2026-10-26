import assert from 'node:assert/strict';
import test from 'node:test';
import { cacheFor, fetchCollection, invalidateCollections, waveFor } from '../src/application/collection-cache.ts';

/** Repository palsu yang responsnya diselesaikan manual dari tes. */
const deferredRepository = () => {
  const pending = [];
  return {
    pending,
    list: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  };
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const start = (repos, repository) => {
  const entry = cacheFor(repos, repository);
  const published = [];
  entry.listeners.add((data) => published.push(data));
  fetchCollection(repository, entry, waveFor(repos));
  return { entry, published };
};

test('koleksi yang dimuat bersamaan terbit bersamaan setelah yang terakhir tiba', async () => {
  const repos = {};
  const wallets = deferredRepository();
  const budgets = deferredRepository();
  const walletView = start(repos, wallets);
  const budgetView = start(repos, budgets);

  budgets.pending[0].resolve([{ id: 'b', spent: 100 }]);
  await tick();
  assert.deepEqual(budgetView.published, [], 'anggaran baru tidak boleh tampil sebelum saldo dompet');
  assert.deepEqual(walletView.published, []);

  wallets.pending[0].resolve([{ id: 'w', balance: 900 }]);
  await tick();
  assert.deepEqual(walletView.published, [[{ id: 'w', balance: 900 }]]);
  assert.deepEqual(budgetView.published, [[{ id: 'b', spent: 100 }]]);
});

test('fetch yang dimulai sebelum data berubah diambil ulang sebelum diterbitkan', async () => {
  const repos = {};
  const wallets = deferredRepository();
  const view = start(repos, wallets);

  invalidateCollections(repos);
  wallets.pending[0].resolve([{ id: 'w', balance: 1000 }]);
  await tick();
  assert.deepEqual(view.published, [], 'hasil sebelum perubahan dibuang');
  assert.equal(wallets.pending.length, 2);

  wallets.pending[1].resolve([{ id: 'w', balance: 900 }]);
  await tick();
  assert.deepEqual(view.published, [[{ id: 'w', balance: 900 }]]);
});

test('koleksi yang gagal tidak menahan koleksi lain', async () => {
  const repos = {};
  const wallets = deferredRepository();
  const budgets = deferredRepository();
  const walletView = start(repos, wallets);
  const budgetView = start(repos, budgets);
  const failed = new Promise((resolve, reject) => walletView.entry.waiters.push({ resolve, reject }));

  budgets.pending[0].resolve([{ id: 'b' }]);
  wallets.pending[0].reject(new Error('offline'));
  await assert.rejects(failed, /offline/);
  await tick();
  assert.deepEqual(budgetView.published, [[{ id: 'b' }]]);
  assert.deepEqual(walletView.published, []);
  assert.equal(walletView.entry.fetching, false);
});

test('hasil yang sudah tiba tetapi belum terbit diambil ulang bila data berubah', async () => {
  const repos = {};
  const wallets = deferredRepository();
  const budgets = deferredRepository();
  const walletView = start(repos, wallets);
  const budgetView = start(repos, budgets);

  budgets.pending[0].resolve([{ id: 'b', spent: 0 }]);
  await tick();
  invalidateCollections(repos);
  assert.equal(budgets.pending.length, 2, 'anggaran diambil ulang');

  // Fetch dompet juga dimulai sebelum perubahan, jadi hasil pertamanya dibuang.
  wallets.pending[0].resolve([{ id: 'w', balance: 1000 }]);
  await tick();
  assert.equal(wallets.pending.length, 2, 'dompet diambil ulang');
  wallets.pending[1].resolve([{ id: 'w', balance: 900 }]);
  await tick();
  assert.deepEqual(walletView.published, [], 'masih menunggu anggaran yang baru');

  budgets.pending[1].resolve([{ id: 'b', spent: 100 }]);
  await tick();
  assert.deepEqual(budgetView.published, [[{ id: 'b', spent: 100 }]]);
  assert.deepEqual(walletView.published, [[{ id: 'w', balance: 900 }]]);
});
