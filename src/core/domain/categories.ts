// ===== Taksonomi kategori transaksi (3 tingkat) =====
// Tingkat 1 = kelompok besar (untuk melihat gambaran besar di laporan),
// tingkat 2 = kategori menengah (setara pos anggaran),
// tingkat 3 = kategori spesifik (yang dicatat di transaksi, agar bisa dianalisa detail).
// Yang disimpan di transaksi tetap SATU string: label paling dalam yang dipilih.
// Relasi ke induknya dicari lewat indeks `categoryPath`.

export interface CategoryOption {
  value: string;
  label: string;
  group?: string;
}

export type CategoryTree = Record<string, Record<string, string[]>>;

export const EXPENSE_TREE: CategoryTree = {
  'Kebutuhan Pokok': {
    'Makanan & Minuman': ['Belanja Dapur', 'Makan di Luar', 'Kopi & Kafe', 'Jajan & Camilan', 'Pesan Antar Online', 'Air Galon'],
    'Rumah & Tempat Tinggal': ['Sewa / Kontrakan', 'Cicilan KPR', 'Perbaikan Rumah', 'Perabot & Perlengkapan', 'Jasa Kebersihan'],
    'Kebutuhan Harian': ['Toiletries', 'Deterjen & Pembersih', 'Gas LPG', 'Perlengkapan Bayi'],
  },
  'Tagihan & Utilitas': {
    'Listrik & Air': ['Token / Tagihan Listrik', 'Air PDAM'],
    Telekomunikasi: ['Internet Rumah', 'Pulsa & Paket Data', 'TV Kabel'],
    'Iuran Wajib': ['Iuran Lingkungan', 'Keamanan & Kebersihan', 'IPL Apartemen'],
  },
  Transportasi: {
    'Kendaraan Pribadi': ['Bensin', 'Servis & Sparepart', 'Parkir', 'Tol', 'Pajak Kendaraan', 'Cuci Kendaraan'],
    'Transportasi Umum': ['KRL & MRT', 'Bus & Angkot', 'Kereta Antarkota'],
    'Transportasi Online': ['Ojek Online', 'Taksi Online'],
    'Perjalanan Jauh': ['Tiket Pesawat', 'Penginapan', 'Oleh-oleh'],
  },
  'Hiburan & Gaya Hidup': {
    'Langganan Hiburan': ['Streaming Film', 'Streaming Musik', 'Game Online', 'Komik & Ebook'],
    Rekreasi: ['Bioskop', 'Konser & Event', 'Wisata & Tiket Masuk', 'Nongkrong'],
    Hobi: ['Peralatan Olahraga', 'Fotografi', 'Koleksi & Mainan', 'Tanaman & Hewan'],
  },
  'Digital & Produktivitas': {
    'Langganan Aplikasi': ['Cloud Storage', 'AI & Software', 'Desain & Editing', 'Email & Produktivitas'],
    Perangkat: ['Gadget & Elektronik', 'Aksesori & Kabel', 'Servis Perangkat'],
    Website: ['Domain', 'Hosting & Server'],
  },
  Kesehatan: {
    Pengobatan: ['Dokter & Konsultasi', 'Obat & Apotek', 'Rumah Sakit', 'Lab & Cek Kesehatan'],
    Perawatan: ['Gigi', 'Mata & Kacamata', 'Terapi & Fisioterapi'],
    Kebugaran: ['Gym & Membership', 'Kelas Olahraga', 'Suplemen & Vitamin'],
    'Asuransi Kesehatan': ['Iuran BPJS', 'Premi Asuransi Swasta'],
  },
  Pendidikan: {
    'Sekolah & Kuliah': ['SPP & Uang Sekolah', 'Uang Gedung', 'Buku & Alat Tulis', 'Seragam'],
    'Pengembangan Diri': ['Kursus & Sertifikasi', 'Seminar & Workshop', 'Buku & Ebook', 'Les Privat'],
  },
  'Personal & Penampilan': {
    Pakaian: ['Baju & Celana', 'Sepatu & Tas', 'Aksesori'],
    'Perawatan Diri': ['Salon & Potong Rambut', 'Skincare & Kosmetik', 'Spa & Pijat', 'Laundry'],
  },
  Keuangan: {
    'Cicilan & Utang': ['Cicilan Kartu Kredit', 'Paylater', 'Angsuran Pinjaman', 'Bayar Utang Pribadi'],
    'Biaya & Pajak': ['Biaya Admin Bank', 'Bunga & Denda', 'Pajak Penghasilan', 'Pajak Lainnya'],
    'Proteksi & Investasi': ['Premi Asuransi Jiwa', 'Setoran Investasi', 'Emas & Logam Mulia'],
    'Transfer Keluar': ['Kirim ke Keluarga', 'Biaya Tarik Tunai'],
  },
  'Sosial & Rohani': {
    Rohani: ['Perpuluhan', 'Persembahan Mingguan', 'Persembahan Syukur', 'Kegiatan Gereja'],
    Sosial: ['Donasi & Sedekah', 'Sumbangan Bencana', 'Iuran Komunitas'],
    'Keluarga & Teman': ['Hadiah & Kado', 'Kondangan & Hajatan', 'Traktir Teman', 'Uang Saku Keluarga'],
  },
  Lainnya: {
    'Tak Terduga': ['Kehilangan & Kerusakan', 'Denda & Tilang', 'Kebutuhan Darurat'],
    // Nama daun sengaja tidak "Lainnya" agar tidak bentrok dengan kelompok besar "Lainnya",
    // yang juga dipakai sebagai nilai jatuh-tempo kalau kategori tidak dipilih.
    // 'Penyesuaian Saldo' dipakai otomatis saat saldo dompet diubah manual.
    'Lain-lain': ['Belum Dikategorikan', 'Penyesuaian Saldo', 'Serba-serbi'],
  },
};

export const INCOME_TREE: CategoryTree = {
  'Active Income': {
    'Salary / Gaji': [],
    'Bonus & Allowance': [],
    'Side Hustle / Freelance': [],
  },
  'Passive Income': {
    Investments: [],
  },
  'Other Income': {
    'Reimbursement / Pelunasan Piutang': [],
    'Gift / Cashflow Lain': [],
  },
};

/** Taksonomi ringkas untuk pencatatan pengeluaran sehari-hari. */
export const PILLAR_EXPENSE_TREE: CategoryTree = {
  Needs: {
    Food: [],
    Housing: [],
    Utilities: [],
    Groceries: [],
    Transport: [],
    'Debt & Bills': [],
    'Personal Care': [],
    Health: [],
  },
  Wants: {
    'Dining Out': [],
    Entertainment: [],
    Shopping: [],
    Lifestyle: [],
    Social: [
      'Traktir Keluarga',
      'Kado / Hadiah',
      'Traktir Teman',
    ],
  },
  Giving: {
    Persepuluhan: [],
    Persembahan: [],
    Taburan: [],
    'Memberi Keluarga': [],
  },
  Savings: {
    'Emergency Fund': [],
    Investments: [],
  },
  Piutang: {},
};

export const CATEGORY_CUSTOM = '__custom__';

const toOptions = (labels: string[]): CategoryOption[] => labels.map((label) => ({ value: label, label }));

/** Pilihan tingkat 1. */
export const topCategories = (tree: CategoryTree) => toOptions(Object.keys(tree));
/** Pilihan tingkat 2 di bawah satu kelompok besar. */
export const midCategories = (tree: CategoryTree, top: string) =>
  toOptions(Object.keys(tree[top] ?? {}));
/** Pilihan tingkat 3 di bawah satu kategori menengah. */
export const leafCategories = (tree: CategoryTree, top: string, mid: string) =>
  toOptions(tree[top]?.[mid] ?? []);

// ===== Indeks pencarian jalur =====
// label (tingkat berapa pun) → [besar, menengah, spesifik?]
const buildIndex = (tree: CategoryTree) => {
  const index = new Map<string, string[]>();
  Object.entries(tree).forEach(([top, mids]) => {
    index.set(top.toLowerCase(), [top]);
    Object.entries(mids).forEach(([mid, leaves]) => {
      index.set(mid.toLowerCase(), [top, mid]);
      leaves.forEach((leaf) => index.set(leaf.toLowerCase(), [top, mid, leaf]));
    });
  });
  return index;
};
const EXPENSE_INDEX = buildIndex(EXPENSE_TREE);
const INCOME_INDEX = buildIndex(INCOME_TREE);
const PILLAR_EXPENSE_INDEX = buildIndex(PILLAR_EXPENSE_TREE);

/** Jalur lengkap sebuah label. Label bebas (di luar taksonomi) berdiri sendiri. */
export function categoryPath(label: string, flow?: 'expense' | 'income'): string[] {
  const key = label?.trim().toLowerCase();
  if (!key) return [];
  if (flow === 'income') return INCOME_INDEX.get(key) ?? [label.trim()];
  if (flow === 'expense') {
    return PILLAR_EXPENSE_INDEX.get(key) ?? EXPENSE_INDEX.get(key) ?? [label.trim()];
  }
  return PILLAR_EXPENSE_INDEX.get(key)
    ?? EXPENSE_INDEX.get(key)
    ?? INCOME_INDEX.get(key)
    ?? [label.trim()];
}
/** Kelompok besar sebuah label — dipakai laporan untuk agregasi tingkat atas. */
export const categoryTop = (label: string) => categoryPath(label)[0] ?? label;
/** Kategori menengah sebuah label; kalau labelnya sudah tingkat 1, dirinya sendiri. */
export const categoryMid = (label: string) => {
  const path = categoryPath(label);
  return path[1] ?? path[0] ?? label;
};
/** Nama untuk ditampilkan lengkap, mis. "Kebutuhan Pokok › Makanan & Minuman › Kopi & Kafe". */
export const categoryLabel = (label: string) => categoryPath(label).join(' › ');

const knownNames = new Set([...PILLAR_EXPENSE_INDEX.keys(), ...EXPENSE_INDEX.keys(), ...INCOME_INDEX.keys()]);
export const isKnownCategory = (label: string) => knownNames.has(label?.trim().toLowerCase());

/** Saran tempat transaksi — dipakai sebagai datalist, tetap boleh diisi bebas. */
export const MERCHANT_SUGGESTIONS = [
  'Indomaret', 'Alfamart', 'Alfamidi', 'Superindo', 'Hypermart', 'Pasar', 'Warung / kaki lima',
  'Kantin', 'Restoran', 'Kafe', 'Starbucks', 'McDonald’s', 'KFC',
  'GoFood', 'GrabFood', 'ShopeeFood', 'Gojek', 'Grab', 'Maxim',
  'Shopee', 'Tokopedia', 'Lazada', 'Blibli', 'TikTok Shop', 'Apple Store', 'Google Play',
  'SPBU Pertamina', 'Shell', 'Apotek K24', 'Kimia Farma', 'Guardian', 'Watsons',
  'Bank / ATM', 'Marketplace lain', 'Online lain',
];

/** Kategori yang muncul di data (budget / transaksi lama) tapi bukan bagian dari taksonomi. */
export const customCategories = (names: string[]): CategoryOption[] => {
  const seen = new Set<string>();
  return names
    .map((name) => name?.trim())
    .filter((name): name is string => {
      if (!name) return false;
      const key = name.toLowerCase();
      if (knownNames.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((name) => ({ value: name, label: name, group: 'Kategori kamu' }));
};
