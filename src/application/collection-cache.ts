// Cache koleksi bersama untuk hook data. Tanpa React supaya aturan penerbitannya bisa diuji.

export type CollectionCacheEntry<T> = {
  data?: T[];
  /** Ada fetch yang belum diterbitkan (masih berjalan atau menunggu gelombangnya). */
  fetching: boolean;
  /** Data berubah setelah fetch yang sedang berjalan dimulai; hasilnya harus diambil ulang. */
  stale: boolean;
  /** Mengambil ulang koleksi ini dalam gelombang yang sama. */
  refetch?: () => void;
  waiters: Array<{ resolve: (data: T[]) => void; reject: (error: unknown) => void }>;
  listeners: Set<(data: T[]) => void>;
};

/**
 * Semua koleksi yang dimuat ulang bersamaan diterbitkan bersamaan.
 *
 * Satu transaksi mengubah beberapa koleksi sekaligus: saldo dompet, realisasi anggaran,
 * tagihan kartu. Bila tiap koleksi tampil begitu responsnya tiba, layar sempat memakai
 * campuran data lama dan baru — arus kas bebas misalnya naik dulu (realisasi anggaran
 * sudah baru, saldo dompet belum) lalu turun lagi. Karena itu hasil fetch ditahan sampai
 * fetch terakhir dalam gelombang yang sama selesai, lalu semua listener dipanggil dalam
 * satu putaran sehingga React merendernya sebagai satu pembaruan.
 */
export type RefreshWave = {
  inFlight: number;
  /** Hasil yang sudah tiba, menunggu fetch lain dalam gelombang yang sama. */
  ready: Map<CollectionCacheEntry<unknown>, () => void>;
  entries: Set<CollectionCacheEntry<unknown>>;
  timer?: ReturnType<typeof setTimeout>;
};

/** Batas tunggu satu gelombang; permintaan yang menggantung tidak boleh membekukan layar. */
export const WAVE_TIMEOUT_MS = 10_000;

// Cache mengikuti instance repository, sehingga otomatis terpisah per workspace dan
// dibuang GC ketika pengguna keluar. Halaman yang di-mount ulang langsung memakai data
// terakhir, lalu melakukan revalidasi di background (stale-while-revalidate).
const collectionCache = new WeakMap<object, CollectionCacheEntry<unknown>>();
const refreshWaves = new WeakMap<object, RefreshWave>();

export function waveFor(repos: object): RefreshWave {
  let wave = refreshWaves.get(repos);
  if (!wave) {
    wave = { inFlight: 0, ready: new Map(), entries: new Set() };
    refreshWaves.set(repos, wave);
  }
  return wave;
}

export function cacheFor<T>(repos: object, repository: object): CollectionCacheEntry<T> {
  let entry = collectionCache.get(repository) as CollectionCacheEntry<T> | undefined;
  if (!entry) {
    entry = { fetching: false, stale: false, waiters: [], listeners: new Set() };
    collectionCache.set(repository, entry as CollectionCacheEntry<unknown>);
    waveFor(repos).entries.add(entry as CollectionCacheEntry<unknown>);
  }
  return entry;
}

/**
 * Dipanggil setiap kali data diketahui berubah (mutasi atau realtime). Fetch yang sudah
 * berjalan sebelum perubahan itu tidak boleh diterbitkan; ia diambil ulang dulu.
 */
export function invalidateCollections(repos: object) {
  const wave = waveFor(repos);
  wave.entries.forEach((entry) => {
    if (!entry.fetching) return;
    if (wave.ready.delete(entry)) entry.refetch?.();
    else entry.stale = true;
  });
}

function flush(wave: RefreshWave) {
  clearTimeout(wave.timer);
  wave.timer = undefined;
  const ready = [...wave.ready.values()];
  wave.ready.clear();
  ready.forEach((publish) => publish());
}

export function fetchCollection<T>(
  repository: { list(): Promise<T[]> },
  entry: CollectionCacheEntry<T>,
  wave: RefreshWave,
) {
  entry.fetching = true;
  entry.stale = false;
  entry.refetch = () => fetchCollection(repository, entry, wave);
  wave.timer ??= setTimeout(() => flush(wave), WAVE_TIMEOUT_MS);
  wave.inFlight += 1;
  const settle = (publish?: () => void) => {
    if (publish) wave.ready.set(entry as CollectionCacheEntry<unknown>, publish);
    wave.inFlight -= 1;
    if (wave.inFlight === 0) flush(wave);
  };
  repository.list().then(
    (fresh) => {
      if (entry.stale) {
        // Ambil ulang lebih dulu supaya gelombang ini tidak sempat kosong lalu terbit.
        fetchCollection(repository, entry, wave);
        settle();
        return;
      }
      settle(() => {
        entry.fetching = false;
        entry.data = fresh;
        entry.listeners.forEach((listener) => listener(fresh));
        entry.waiters.splice(0).forEach((waiter) => waiter.resolve(fresh));
      });
    },
    (error) => {
      entry.fetching = false;
      entry.waiters.splice(0).forEach((waiter) => waiter.reject(error));
      settle();
    },
  );
}
