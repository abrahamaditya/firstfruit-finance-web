'use client';

import React, {
  FormEvent,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { RepositoryProvider, useRepositories } from '../infrastructure/RepositoryProvider';
import {
  AuthBoundary,
  AuthProvider,
  type WorkspaceAccess,
  useAuthWorkspace,
} from '../infrastructure/supabase/AuthProvider';
import { getBrowserSupabase } from '../infrastructure/supabase/browser';
import { formatIDR, formatMoney, formatMoneyCompact } from '../core/domain/money';
import { BeneficiaryKind, TxBeneficiary, WalletMedium } from '../core/domain/types';
import {
  CATEGORY_CUSTOM,
  CategoryOption,
  CategoryTree,
  EXPENSE_TREE,
  INCOME_TREE,
  MERCHANT_SUGGESTIONS,
  categoryPath,
  customCategories,
  leafCategories,
  midCategories,
  topCategories,
} from '../core/domain/categories';
import { translate } from '../core/i18n';
import {
  DEFAULT_HOME_TOOLS,
  DEFAULT_PREFS,
  PROFILE_PLACEHOLDER_NAME,
  displayNameMetadata,
  identityFromUser,
  resolveDisplayName,
  type Preferences,
} from '../core/preferences';
import {
  Bell,
  ArrowLeft,
  Calendar,
  Card,
  Chart,
  Check,
  Chevron,
  ChevronR,
  Close,
  Copy,
  Download,
  Gauge,
  Grid,
  Home,
  ListIcon,
  Lock,
  Pencil,
  Plus,
  Receivable,
  Recur,
  Settings,
  Split,
  Target,
  Transfer,
  Trash,
  User,
  WalletIcon,
} from './ui/icons';
import HomeScreen from '../features/HomeScreen';
import WalletsScreen from '../features/WalletsScreen';
import TransactionsScreen from '../features/TransactionsScreen';
import SubscriptionsScreen from '../features/SubscriptionsScreen';
import BudgetScreen from '../features/BudgetScreen';
import ReceivablesScreen from '../features/ReceivablesScreen';
import SplitScreen from '../features/SplitScreen';
import PlanningScreen from '../features/PlanningScreen';
import ReportsScreen from '../features/ReportsScreen';
import CalendarScreen from '../features/CalendarScreen';
import PeopleScreen from '../features/PeopleScreen';
import ClosingScreen from '../features/ClosingScreen';
import ProfileScreen from '../features/ProfileScreen';
import { usePeriods } from '../application/hooks';

export type Tab =
  | 'home'
  | 'wallets'
  | 'tx'
  | 'subs'
  | 'budget'
  | 'split'
  | 'piutang'
  | 'planning'
  | 'reports'
  | 'calendar'
  | 'tutup'
  | 'people'
  | 'profile';
export type CreateType =
  | 'wallet'
  | 'subscription'
  | 'planning'
  | 'piutang'
  | 'budget'
  | 'periode'
  | 'orang'
  | 'transfer'
  | 'transaksi'
  | 'tabungan'
  | 'sisihkan'
  | 'ambil'
  | 'reminder'
  | 'beneficiary';

export type { Preferences } from '../core/preferences';

const PREFS_KEY = 'abraham.prefs';

interface UI {
  go: (tab: Tab) => void;
  openNotif: () => void;
  openAdd: () => void;
  openTools: () => void;
  openItem: (name: string, type: CreateType, id?: string) => void;
  openCreate: (type: CreateType, isEdit?: boolean, name?: string, id?: string) => void;
  notify: (message: string) => void;
  refresh: () => void;
  prefs: Preferences;
  setPref: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  saveProfile: (name: string, email: string) => Promise<void>;
  signOut: () => Promise<void>;
  rate: number;          // IDR per 1 USD
  rateUpdated: string;   // kapan kurs terakhir diperbarui
}

const FX_KEY = 'abraham.fx';
const FX_FALLBACK = 16000; // dipakai bila API & cache gagal

// Field nominal uang: input diberi pemisah ribuan otomatis (digit mentah disimpan di state).
const MONEY_FIELDS = new Set(['amount', 'balance', 'creditLimit', 'owed', 'target', 'saved', 'allocated', 'spent', 'share']);
// Kapsul nominal cepat (menambah ke nilai saat ini).
const QUICK_AMOUNTS = [50_000, 100_000, 500_000, 1_000_000, 5_000_000];

/** Hook terjemahan reaktif mengikuti preferensi bahasa. */
export function useT() {
  const ui = useUI();
  return (key: string, vars?: Record<string, string | number>) => translate(ui.prefs.language, key, vars);
}

/** Format uang reaktif mengikuti preferensi mata uang + kurs live. Nilai selalu dalam IDR. */
export function useMoney() {
  const ui = useUI();
  return {
    code: ui.prefs.currency,
    rate: ui.rate,
    rateUpdated: ui.rateUpdated,
    fmt: (idr: number) => formatMoney(idr, ui.prefs.currency, ui.rate),
    fmtCompact: (idr: number) => formatMoneyCompact(idr, ui.prefs.currency, ui.rate),
  };
}

interface FieldDefinition {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select';
  options?: CategoryOption[];
  optionsOf?: (form: Record<string, string>) => CategoryOption[];  // pilihan dinamis
  placeholder?: string;
  optional?: boolean;
  suggestions?: string[];                              // datalist untuk input teks bebas
  showIf?: (form: Record<string, string>) => boolean;  // field kondisional
  labelOf?: (form: Record<string, string>) => string;  // label dinamis
}

interface FormConfig {
  title: string;
  description: string;
  fields: FieldDefinition[];
  defaults: Record<string, string>;
}

const UICtx = createContext<UI | null>(null);

export const useUI = () => {
  const context = useContext(UICtx);
  if (!context) throw new Error('useUI outside provider');
  return context;
};

const mainNavigation: Array<{ tab: Tab; label: string; icon: React.ReactNode }> = [
  { tab: 'home', label: 'nav.home', icon: <Home /> },
  { tab: 'wallets', label: 'nav.wallets', icon: <WalletIcon /> },
  { tab: 'tx', label: 'nav.tx', icon: <ListIcon /> },
  { tab: 'subs', label: 'nav.subs', icon: <Recur /> },
  { tab: 'budget', label: 'nav.budget', icon: <Gauge /> },
];

const toolNavigation: Array<{ tab: Tab; label: string; icon: React.ReactNode }> = [
  { tab: 'split', label: 'nav.split', icon: <Split /> },
  { tab: 'piutang', label: 'nav.piutang', icon: <Receivable /> },
  { tab: 'planning', label: 'nav.planning', icon: <Target /> },
  { tab: 'reports', label: 'nav.reports', icon: <Chart /> },
  { tab: 'calendar', label: 'nav.calendar', icon: <Calendar /> },
  { tab: 'tutup', label: 'nav.tutup', icon: <Lock /> },
];

// Layar yang tidak punya tombol sendiri di bilah bawah — diwakili tombol "Lainnya".
const extraNavigation: Array<{ tab: Tab; label: string; icon: React.ReactNode }> = [
  { tab: 'people', label: 'nav.people', icon: <User /> },
  { tab: 'profile', label: 'side.settings', icon: <Settings /> },
];
const MORE_TABS: Tab[] = [
  ...mainNavigation.map((entry) => entry.tab).filter((tab) => tab !== 'home'),
  ...toolNavigation.map((entry) => entry.tab),
  ...extraNavigation.map((entry) => entry.tab),
].filter((tab) => tab !== 'wallets' && tab !== 'tx');

/**
 * Pintasan yang boleh dipasang pengguna di deret aksi beranda. Dua jenis dalam satu daftar:
 * `create` membuka form, `tab` pindah layar. Digabung supaya hanya ada SATU permukaan
 * pintasan yang perlu diatur — sebelumnya deret aksi tetap dan grid alat yang bisa diatur
 * saling tumpang tindih (Split & Anggaran muncul di keduanya).
 * Bagian navigasinya diturunkan dari definisi sidebar, jadi label & ikonnya mustahil beda.
 * 'home' dibuang (sudah di sana), 'profile' juga (pengaturan, bukan alat keuangan).
 */
export interface HomeShortcut {
  id: string;
  label: string;
  icon: React.ReactNode;
  tab?: Tab;
  create?: CreateType;
}
export const HOME_SHORTCUTS: HomeShortcut[] = [
  { id: 'log', label: 'home.log', icon: <Plus />, create: 'transaksi' },
  { id: 'transfer', label: 'home.transfer', icon: <Transfer />, create: 'transfer' },
  ...[
    ...mainNavigation.filter((entry) => entry.tab !== 'home'),
    ...toolNavigation,
    ...extraNavigation.filter((entry) => entry.tab !== 'profile'),
  ].map((entry) => ({ id: entry.tab as string, ...entry })),
];

const toDateInput = (value?: string | null) =>
  value ? new Date(value).toISOString().slice(0, 10) : '';
const toIso = (value: string) => new Date(`${value}T12:00:00`).toISOString();
const toNumber = (value?: string) => Number((value || '0').replace(/[^\d.-]/g, '')) || 0;

/** Pecah opsi jadi rentetan berurutan per grup agar bisa dirender sebagai <optgroup>. */
const groupOptions = (options: CategoryOption[] = []): Array<[string | undefined, CategoryOption[]]> =>
  options.reduce<Array<[string | undefined, CategoryOption[]]>>((runs, option) => {
    const last = runs.at(-1);
    if (last && last[0] === option.group) last[1].push(option);
    else runs.push([option.group, [option]]);
    return runs;
  }, []);

interface NotifEntry {
  id: string;
  title: string;
  body: string;
  when: string;
  tone: 'r' | 'e';            // r = mendesak/biaya, e = informasi
  icon: React.ReactNode;
}
export const BENEFICIARY_KINDS: CategoryOption[] = [
  { value: 'person', label: 'Orang' },
  { value: 'family', label: 'Keluarga' },
  { value: 'church', label: 'Gereja / rohani' },
  { value: 'organization', label: 'Organisasi / yayasan' },
  { value: 'business', label: 'Bisnis / instansi' },
];
export const beneficiaryKindLabel = (kind: string) =>
  BENEFICIARY_KINDS.find((entry) => entry.value === kind)?.label ?? kind;

const CATEGORY_KEYS = { l1: 'catL1', l2: 'catL2', l3: 'catL3', custom: 'catCustom' } as const;

/** Kategori yang disimpan = tingkat terdalam yang dipilih (atau ketikan sendiri). */
const pickCategory = (form: Record<string, string>): string => {
  if (form[CATEGORY_KEYS.l1] === CATEGORY_CUSTOM || form[CATEGORY_KEYS.l3] === CATEGORY_CUSTOM) {
    return form[CATEGORY_KEYS.custom]?.trim() || 'Lainnya';
  }
  const deepest = [form[CATEGORY_KEYS.l3], form[CATEGORY_KEYS.l2], form[CATEGORY_KEYS.l1]]
    .map((value) => value?.trim())
    .find((value) => value && value !== CATEGORY_CUSTOM);
  return deepest || 'Lainnya';
};

/** Isi ulang tiga tingkat pemilih kategori dari satu label tersimpan. */
const spreadCategory = (label?: string) => {
  const path = label ? categoryPath(label) : [];
  if (path.length <= 1) {
    // Kategori bebas (di luar taksonomi) tetap bisa diedit lewat opsi "kategori lain".
    return path.length === 1
      ? { catL1: CATEGORY_CUSTOM, catL2: '', catL3: '', catCustom: path[0] }
      : null;
  }
  return { catL1: path[0], catL2: path[1] ?? '', catL3: path[2] ?? '', catCustom: '' };
};

/** Perubahan satu field kadang membatalkan pilihan di bawahnya. */
const applyFieldChange = (form: Record<string, string>, key: string, value: string) => {
  const cleared = { catL1: '', catL2: '', catL3: '', catCustom: '' };
  if (key === 'txType' && value !== form.txType) {
    return { ...form, ...cleared, txType: value, beneficiary: '', recipient: '', owed: '', nature: '', payer: '', incomeNature: '' };
  }
  if (key === CATEGORY_KEYS.l1) return { ...form, catL1: value, catL2: '', catL3: '', catCustom: '' };
  if (key === CATEGORY_KEYS.l2) return { ...form, catL2: value, catL3: '' };
  return { ...form, [key]: value };
};

function Inner({ initialPreferences }: { initialPreferences?: Preferences }) {
  const repos = useRepositories();
  const auth = useAuthWorkspace();
  const { active: activePeriod } = usePeriods();
  const [tab, setTab] = useState<Tab>('home');
  const [tabHistory, setTabHistory] = useState<Tab[]>([]);
  const [sheet, setSheet] = useState<null | 'notif' | 'item' | 'create' | 'more' | 'tools'>(null);
  const [notifications, setNotifications] = useState<NotifEntry[]>([]);
  const [readNotifs, setReadNotifs] = useState<string[]>([]);
  const [item, setItem] = useState<{ name: string; type: CreateType; id?: string }>({
    name: '',
    type: 'wallet',
  });
  const [create, setCreate] = useState<{
    type: CreateType;
    isEdit: boolean;
    name?: string;
    id?: string;
    duplicate?: boolean;
  }>({ type: 'wallet', isEdit: false });
  const [form, setForm] = useState<Record<string, string>>({});
  const [walletOptions, setWalletOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [debitWalletOptions, setDebitWalletOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [savingOptions, setSavingOptions] = useState<Array<{ value: string; label: string; walletId: string }>>([]);
  const [budgetOptions, setBudgetOptions] = useState<CategoryOption[]>([]);
  const [receivableOptions, setReceivableOptions] = useState<CategoryOption[]>([]);
  const [beneficiaryOptions, setBeneficiaryOptions] = useState<CategoryOption[]>([]);
  const [merchantSuggestions, setMerchantSuggestions] = useState<string[]>(MERCHANT_SUGGESTIONS);
  const [dataVersion, setDataVersion] = useState(0);
  const [openSuggest, setOpenSuggest] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>(() => initialPreferences ?? ({
    ...DEFAULT_PREFS,
    ...(auth.user ? identityFromUser(auth.user) : {}),
  }));
  const [prefsLoaded, setPrefsLoaded] = useState(Boolean(initialPreferences));
  const [rate, setRate] = useState(FX_FALLBACK);
  const [rateUpdated, setRateUpdated] = useState('');

  // Preferensi dan identitas selalu dimuat dari akun/workspace Supabase aktif.
  useEffect(() => {
    if (!auth.user || !auth.workspaceId) return;
    let active = true;
    const user = auth.user;
    const workspaceId = auth.workspaceId;
    const sessionIdentity = identityFromUser(user);
    setPrefsLoaded(false);
    const supabase = getBrowserSupabase();
    void Promise.all([
      supabase.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_workspace_preferences').select('*')
        .eq('user_id', user.id).eq('workspace_id', workspaceId).maybeSingle(),
    ]).then(([profileResult, preferenceResult]) => {
      if (!active) return;
      if (profileResult.error) {
        console.error('Gagal memuat profil Supabase', profileResult.error);
      }
      if (preferenceResult.error) {
        console.error('Gagal memuat preferensi Supabase', preferenceResult.error);
      }
      const row = preferenceResult.data;
      const tools = Array.isArray(row?.home_tools)
        ? row.home_tools.filter((id: string) => HOME_SHORTCUTS.some((entry) => entry.id === id))
        : DEFAULT_HOME_TOOLS;
      const storedName = profileResult.data?.display_name?.trim() ?? '';
      const resolvedName = resolveDisplayName(user, storedName);
      setPrefs({
        theme: row?.theme === 'light' ? 'light' : DEFAULT_PREFS.theme,
        language: row?.language === 'EN' ? 'EN' : DEFAULT_PREFS.language,
        currency: row?.display_currency === 'USD' ? 'USD' : DEFAULT_PREFS.currency,
        notifications: row?.notifications_enabled ?? DEFAULT_PREFS.notifications,
        hideHomeAmounts: row?.hide_home_amounts ?? DEFAULT_PREFS.hideHomeAmounts,
        name: resolvedName,
        email: sessionIdentity.email,
        defaultWalletId: row?.default_wallet_id ?? DEFAULT_PREFS.defaultWalletId,
        homeTools: tools,
      });
      // Akun lama mungkin sudah terlanjur dibootstrap dengan nama placeholder.
      // Simpan nama autentik agar reload berikutnya memakai satu sumber yang konsisten.
      if (
        !profileResult.error
        && storedName === PROFILE_PLACEHOLDER_NAME
        && resolvedName !== PROFILE_PLACEHOLDER_NAME
      ) {
        void supabase.from('profiles')
          .update({ display_name: resolvedName })
          .eq('user_id', user.id)
          .then(({ error }) => {
            if (error) console.error('Gagal menyelaraskan nama profil Supabase', error);
          });
      }
      const currentMetadata = user.user_metadata;
      if (
        resolvedName !== PROFILE_PLACEHOLDER_NAME
        && (
          currentMetadata.display_name !== resolvedName
          || currentMetadata.full_name !== resolvedName
          || currentMetadata.name !== resolvedName
        )
      ) {
        void supabase.auth.updateUser({ data: displayNameMetadata(resolvedName) })
          .then(({ error }) => {
            if (error) console.error('Gagal menyelaraskan metadata nama Auth', error);
          });
      }
    }).catch((error) => {
      console.error('Gagal memuat preferensi Supabase', error);
    }).finally(() => {
      if (active) setPrefsLoaded(true);
    });
    return () => { active = false; };
  }, [auth.user, auth.workspaceId]);

  // Terapkan tema secara langsung dan sinkronkan preferensi workspace secara debounced.
  useEffect(() => {
    if (!prefsLoaded || !auth.user || !auth.workspaceId) return;
    document.documentElement.dataset.theme = prefs.theme;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: prefs.theme }));
    } catch {
      /* storage penuh / diblokir — abaikan */
    }
    const timer = window.setTimeout(() => {
      void getBrowserSupabase().from('user_workspace_preferences').upsert({
        user_id: auth.user!.id,
        workspace_id: auth.workspaceId!,
        language: prefs.language,
        display_currency: prefs.currency,
        theme: prefs.theme,
        default_wallet_id: prefs.defaultWalletId || null,
        hide_home_amounts: prefs.hideHomeAmounts,
        notifications_enabled: prefs.notifications,
        home_tools: prefs.homeTools,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,workspace_id' }).then(({ error }) => {
        if (error) console.error('Gagal menyimpan preferensi Supabase', error);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [auth.user, auth.workspaceId, prefs, prefsLoaded]);

  // Memasang pintasan menambahkannya di akhir daftar, jadi urutan grid beranda mengikuti
  // urutan pemasangan — pengguna dapat kendali urutan tanpa perlu antarmuka geser.
  const toggleHomeTool = (id: string) =>
    setPrefs((current) => ({
      ...current,
      homeTools: current.homeTools.includes(id)
        ? current.homeTools.filter((entry) => entry !== id)
        : [...current.homeTools, id],
    }));

  const setPref = useCallback(
    <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
      setPrefs((current) => ({ ...current, [key]: value })),
    [],
  );

  // Kurs USD↔IDR: pakai cache dulu (offline-friendly), lalu tarik kurs live harian.
  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(FX_KEY) || '{}');
      if (cached.idrPerUsd) { setRate(cached.idrPerUsd); setRateUpdated(cached.at || ''); }
    } catch {
      /* abaikan */
    }
    fetch('https://open.er-api.com/v6/latest/USD')
      .then((response) => response.json())
      .then((data) => {
        const idrPerUsd = data?.rates?.IDR;
        if (typeof idrPerUsd === 'number' && idrPerUsd > 0) {
          const at = data.time_last_update_utc || new Date().toISOString();
          setRate(idrPerUsd);
          setRateUpdated(at);
          try { localStorage.setItem(FX_KEY, JSON.stringify({ idrPerUsd, at })); } catch { /* abaikan */ }
        }
      })
      .catch(() => { /* offline: pakai cache/fallback */ });
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }, []);

  // Terjemahan lokal (context belum tersedia di dalam provider ini).
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(prefs.language, key, vars),
    [prefs.language],
  );

  // Tampilkan digit mentah dengan pemisah ribuan (id-ID → titik, en-US → koma).
  const numLocale = prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const groupThousands = (raw: string) => {
    const digits = (raw || '').replace(/\D/g, '');
    return digits ? Number(digits).toLocaleString(numLocale) : '';
  };

  const go = useCallback((next: Tab) => {
    if (next === tab) {
      setSheet(null);
      return;
    }
    setTabHistory((history) => [...history, tab].slice(-12));
    setTab(next);
    setSheet(null);
  }, [tab]);

  const goBack = useCallback(() => {
    setTabHistory((history) => {
      const previous = history.at(-1) ?? 'home';
      setTab(previous);
      return history.slice(0, -1);
    });
    setSheet(null);
  }, []);

  const openCreate = useCallback(
    (type: CreateType, isEdit = false, name?: string, id?: string) => {
      setCreate({ type, isEdit, name, id, duplicate: !isEdit && Boolean(id) });
      setSheet('create');
    },
    [],
  );

  const ui: UI = {
    go,
    openNotif: () => setSheet('notif'),
    openAdd: () => openCreate('transaksi'),
    openTools: () => setSheet('tools'),
    openItem: (name, type, id) => {
      setItem({ name, type, id });
      setSheet('item');
    },
    openCreate,
    notify,
    refresh: () => setDataVersion((version) => version + 1),
    prefs,
    setPref,
    saveProfile: async (name, email) => {
      const supabase = getBrowserSupabase();
      const displayName = name.trim() || 'Tanpa nama';
      const nextEmail = email.trim();
      const emailChanged = Boolean(
        nextEmail
        && nextEmail.toLowerCase() !== auth.user?.email?.toLowerCase(),
      );

      // Supabase Auth menyimpan display name di user_metadata (raw_user_meta_data
      // pada auth.users), bukan sebagai kolom top-level yang dapat diedit client.
      const { data: authData, error: authError } = await supabase.auth.updateUser({
        data: displayNameMetadata(displayName),
        ...(emailChanged ? { email: nextEmail } : {}),
      });
      if (authError) throw authError;
      if (
        authData.user.user_metadata.display_name !== displayName
        || authData.user.user_metadata.full_name !== displayName
        || authData.user.user_metadata.name !== displayName
      ) {
        throw new Error('Metadata nama Supabase Auth tidak berhasil diperbarui.');
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('user_id', auth.user!.id)
        .select('display_name')
        .maybeSingle();
      if (profileError) throw profileError;
      if (profileData?.display_name !== displayName) {
        throw new Error('Profil tidak ditemukan atau tidak dapat diperbarui.');
      }

      setPrefs((current) => ({
        ...current,
        name: displayName,
        // Bila perubahan email memerlukan konfirmasi, Supabase masih mengembalikan
        // email lama sampai tautan konfirmasi disetujui.
        email: authData.user.email ?? nextEmail,
      }));
    },
    signOut: auth.signOut,
    rate,
    rateUpdated,
  };

  // Perubahan dari perangkat atau anggota workspace lain langsung menyegarkan read model.
  useEffect(() => {
    if (!auth.workspaceId) return;
    const supabase = getBrowserSupabase();
    const workspaceId = auth.workspaceId;
    let timer: number | undefined;
    const scheduleRefresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setDataVersion((version) => version + 1), 120);
    };
    let channel = supabase.channel(`firstfruit-finance-${workspaceId}`);
    [
      'wallets',
      'transactions',
      'budgets',
      'budget_periods',
      'subscriptions',
      'reminders',
      'savings_goals',
      'receivables',
      'financial_plans',
      'beneficiaries',
    ].forEach((table) => {
      channel = channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table,
        filter: `workspace_id=eq.${workspaceId}`,
      }, scheduleRefresh);
    });
    channel.subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [auth.workspaceId]);

  const formConfig = useCallback(
    (type: CreateType): FormConfig => {
      const wallets = walletOptions.length
        ? walletOptions
        : [{ value: 'w_bca', label: 'BCA' }];
      const debitWallets = debitWalletOptions.length ? debitWalletOptions : wallets;
      const CUSTOM = { value: CATEGORY_CUSTOM, label: '➕ Kategori lain…' };
      // Pemilih kategori bertingkat: besar → menengah → spesifik.
      // `treeOf` menentukan pohon mana yang dipakai (pengeluaran vs pemasukan).
      const catFields = (
        treeOf: (f: Record<string, string>) => CategoryTree,
        prefix = '',
        appliesTo: (f: Record<string, string>) => boolean = () => true,
      ): FieldDefinition[] => {
        const k = (name: string) => `${prefix}${name}`;
        const visible = (extra: (f: Record<string, string>) => boolean) =>
          (f: Record<string, string>) => appliesTo(f) && extra(f);
        return [
          {
            key: k('catL1'),
            label: 'Kelompok besar',
            type: 'select',
            optionsOf: (f) => [...topCategories(treeOf(f)), ...categoryOptions, CUSTOM],
            showIf: visible(() => true),
          },
          {
            key: k('catL2'),
            label: 'Kategori',
            type: 'select',
            optionsOf: (f) => midCategories(treeOf(f), f[k('catL1')]),
            showIf: visible((f) => Boolean(f[k('catL1')]) && midCategories(treeOf(f), f[k('catL1')]).length > 0),
          },
          {
            key: k('catL3'),
            label: 'Spesifik (opsional)',
            type: 'select',
            optional: true,
            optionsOf: (f) => [
              { value: '', label: '— Cukup sampai kategori di atas' },
              ...leafCategories(treeOf(f), f[k('catL1')], f[k('catL2')]),
              CUSTOM,
            ],
            showIf: visible((f) => leafCategories(treeOf(f), f[k('catL1')], f[k('catL2')]).length > 0),
          },
          {
            key: k('catCustom'),
            label: 'Nama kategori baru',
            placeholder: 'Ketik kategori sendiri',
            showIf: visible((f) => f[k('catL1')] === CATEGORY_CUSTOM || f[k('catL3')] === CATEGORY_CUSTOM),
          },
        ];
      };
      const savingsFor = (walletId?: string) =>
        savingOptions.filter((s) => s.walletId === walletId).map(({ value, label }) => ({ value, label }));
      const isExpense = (form: Record<string, string>) => form.txType === 'expense';
      const isIncome = (form: Record<string, string>) => form.txType === 'income';
      const isTransfer = (form: Record<string, string>) => form.txType === 'transfer';
      const defaultWalletId = prefs.defaultWalletId || '';
      const owesBack = (b: string) => b === 'gift' || b === 'lent' || b === 'shared';
      const today = new Date().toISOString().slice(0, 10);
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const nextMonthValue = nextMonth.toISOString().slice(0, 10);

      // Satu definisi dipakai dua kali: 'transaksi' dan alias 'transfer'.
      const transaksiConfig: FormConfig = {
          title: 'transaksi',
          description: 'Catat arus uang agar saldo dan laporan tetap akurat.',
          fields: [
            // Satu form untuk tiga jenis arus uang; sisa field menyesuaikan pilihan ini.
            {
              key: 'txType',
              label: 'Jenis transaksi',
              type: 'select',
              options: [
                { value: 'expense', label: '↓ Pengeluaran' },
                { value: 'income', label: '↑ Pemasukan' },
                { value: 'transfer', label: '⇄ Transfer antar-dompet' },
              ],
            },
            { key: 'amount', label: 'Jumlah', type: 'number' },
            {
              key: 'walletId',
              label: 'Dompet',
              labelOf: (f) => (isIncome(f) ? 'Masuk ke dompet' : isTransfer(f) ? 'Dari dompet' : 'Dibayar dari dompet'),
              type: 'select',
              options: wallets,
            },
            // ==== khusus transfer ====
            { key: 'toWalletId', label: 'Ke dompet', type: 'select', options: wallets, showIf: isTransfer },
            {
              key: 'savingId',
              label: 'Sisihkan ke tabungan',
              type: 'select',
              optional: true,
              optionsOf: (f) => [{ value: 'none', label: '— Tidak disisihkan' }, ...savingsFor(f.toWalletId)],
              showIf: (f) => isTransfer(f) && savingsFor(f.toWalletId).length > 0,
            },
            {
              key: 'note',
              label: 'Catatan',
              labelOf: (f) => (isIncome(f) ? 'Keterangan' : 'Catatan'),
              placeholder: 'Contoh: Makan siang',
            },
            ...catFields((f) => (isIncome(f) ? INCOME_TREE : EXPENSE_TREE), '', (f) => !isTransfer(f)),
            // Pihak terkait diambil dari daftar penerima supaya penamaannya konsisten.
            {
              key: 'beneficiaryId',
              label: 'Pihak terkait',
              labelOf: (f) => (isIncome(f) ? 'Dari siapa' : 'Untuk pihak'),
              type: 'select',
              optional: true,
              options: [
                { value: 'none', label: '— Tidak ada' },
                ...beneficiaryOptions,
                { value: CATEGORY_CUSTOM, label: '➕ Tambah pihak baru…' },
              ],
              showIf: (f) => !isTransfer(f),
            },
            {
              key: 'beneficiaryName',
              label: 'Nama pihak baru',
              placeholder: 'Contoh: Gereja, Keluarga, Budi',
              showIf: (f) => !isTransfer(f) && f.beneficiaryId === CATEGORY_CUSTOM,
            },
            {
              key: 'beneficiaryKind',
              label: 'Jenis pihak',
              type: 'select',
              options: BENEFICIARY_KINDS,
              showIf: (f) => !isTransfer(f) && f.beneficiaryId === CATEGORY_CUSTOM,
            },
            {
              key: 'merchant',
              label: 'Tempat transaksi',
              labelOf: (f) => (isIncome(f) ? 'Tempat / kanal' : 'Tempat transaksi'),
              placeholder: 'Contoh: Indomaret, Shopee, kaki lima',
              optional: true,
              suggestions: merchantSuggestions,
            },
            // Menghubungkan pengeluaran ke pos anggaran — realisasi anggaran ikut bertambah.
            {
              key: 'budgetId',
              label: 'Masuk ke anggaran',
              type: 'select',
              optional: true,
              options: [{ value: 'none', label: '— Tidak dibebankan ke anggaran' }, ...budgetOptions],
              showIf: (f) => isExpense(f) && budgetOptions.length > 0,
            },
            // ==== khusus pemasukan ====
            // Pemasukan bisa langsung menutup piutang — piutangnya otomatis jadi lunas.
            {
              key: 'settlesReceivableId',
              label: 'Pelunasan piutang',
              type: 'select',
              optional: true,
              options: [{ value: 'none', label: '— Bukan pelunasan piutang' }, ...receivableOptions],
              showIf: (f) => isIncome(f) && receivableOptions.length > 0,
            },
            {
              key: 'incomeNature',
              label: 'Sifat pemasukan',
              type: 'select',
              options: [
                { value: 'fixed', label: 'Rutin / terjadwal' },
                { value: 'unexpected', label: 'Tidak rutin / sekali ini' },
              ],
              showIf: isIncome,
            },
            // ==== khusus pengeluaran ====
            {
              key: 'beneficiary',
              label: 'Untuk siapa?',
              type: 'select',
              options: [
                { value: 'self', label: 'Diri sendiri' },
                { value: 'gift', label: 'Orang lain — memberi 🎁' },
                { value: 'lent', label: 'Orang lain — ditalangin (piutang)' },
                { value: 'shared', label: 'Patungan / setengah²' },
              ],
              showIf: isExpense,
            },
            { key: 'recipient', label: 'Nama orang', placeholder: 'Contoh: Budi', showIf: (f) => isExpense(f) && owesBack(f.beneficiary) },
            { key: 'owed', label: 'Ditagih balik (piutang)', type: 'number', placeholder: 'Default: separuh', showIf: (f) => isExpense(f) && f.beneficiary === 'shared' },
            {
              key: 'nature',
              label: 'Sifat pengeluaran',
              type: 'select',
              options: [
                { value: 'fixed', label: 'Terencana' },
                { value: 'unexpected', label: 'Tak terduga' },
              ],
              showIf: isExpense,
            },
            { key: 'date', label: 'Tanggal', type: 'date' },
          ],
          defaults: {
            txType: '',
            amount: '',
            walletId: defaultWalletId,
            toWalletId: '',
            savingId: 'none',
            note: '',
            catL1: '',
            catL2: '',
            catL3: '',
            catCustom: '',
            merchant: '',
            budgetId: 'none',
            beneficiaryId: 'none',
            beneficiaryName: '',
            beneficiaryKind: 'person',
            settlesReceivableId: 'none',
            incomeNature: '',
            beneficiary: '',
            recipient: '',
            owed: '',
            nature: '',
            date: today,
          },
        };

      const configs: Record<CreateType, FormConfig> = {
        wallet: {
          title: 'dompet',
          description: 'Tambahkan rekening bank, e-wallet, kartu kredit, atau uang tunai.',
          fields: [
            { key: 'name', label: 'Nama dompet', placeholder: 'Contoh: BCA' },
            {
              key: 'medium',
              label: 'Sifat dompet',
              type: 'select',
              options: [
                { value: 'bank', label: 'Rekening / kartu debit' },
                { value: 'credit', label: 'Kartu kredit' },
                { value: 'ewallet', label: 'E-wallet' },
                { value: 'cash', label: 'Uang tunai' },
              ],
            },
            { key: 'balance', label: 'Saldo saat ini', type: 'number' },
            {
              key: 'bank',
              label: 'Bank / penerbit',
              labelOf: (f) => (f.medium === 'ewallet' ? 'Penyedia e-wallet' : 'Bank / penerbit'),
              placeholder: 'Opsional',
              optional: true,
              showIf: (f) => f.medium !== 'cash',
            },
            // Rekening & kartu diidentifikasi 4 digit terakhir; e-wallet pakai nomor HP.
            { key: 'last4', label: '4 digit terakhir', placeholder: '0000', optional: true, showIf: (f) => f.medium === 'bank' || f.medium === 'credit' },
            { key: 'phone', label: 'Nomor HP', placeholder: '08xxxxxxxxxx', optional: true, showIf: (f) => f.medium === 'ewallet' },
            { key: 'creditLimit', label: 'Limit kredit', type: 'number', showIf: (f) => f.medium === 'credit' },
          ],
          defaults: { name: '', medium: '', balance: '', bank: '', last4: '', phone: '', creditLimit: '' },
        },
        transaksi: transaksiConfig,
        // Transfer memakai form transaksi yang sama; hanya jenisnya sudah terpilih.
        transfer: { ...transaksiConfig, defaults: { ...transaksiConfig.defaults, txType: 'transfer', note: 'Transfer internal' } },
        subscription: {
          title: 'langganan',
          description: 'Pantau pembayaran berulang dan dapatkan pengingat sebelum ditagih.',
          fields: [
            { key: 'name', label: 'Nama layanan', placeholder: 'Contoh: Netflix' },
            { key: 'amount', label: 'Nominal per tagihan', type: 'number' },
            {
              key: 'cycle',
              label: 'Siklus',
              type: 'select',
              options: [
                { value: 'weekly', label: 'Mingguan' },
                { value: 'monthly', label: 'Bulanan' },
                { value: 'quarterly', label: '3 bulanan' },
                { value: 'yearly', label: 'Tahunan' },
              ],
            },
            { key: 'walletId', label: 'Dompet pembayaran', type: 'select', options: wallets },
            ...catFields(() => EXPENSE_TREE),
            { key: 'nextBillingDate', label: 'Tagihan berikutnya', type: 'date' },
            { key: 'endDate', label: 'Tanggal berakhir', type: 'date' },
            { key: 'reminderDaysBefore', label: 'Ingatkan (hari sebelumnya)', type: 'number' },
          ],
          defaults: {
            name: '',
            amount: '',
            cycle: '',
            walletId: '',
            catL1: '',
            catL2: '',
            catL3: '',
            catCustom: '',
            nextBillingDate: nextMonthValue,
            endDate: '',
            reminderDaysBefore: '3',
          },
        },
        planning: {
          title: 'rencana',
          description: 'Buat simulasi tujuan tanpa memengaruhi saldo aktif.',
          fields: [
            { key: 'title', label: 'Judul rencana', placeholder: 'Contoh: Dana darurat' },
            { key: 'target', label: 'Target nominal', type: 'number' },
            { key: 'saved', label: 'Sudah terkumpul', type: 'number' },
            { key: 'targetDate', label: 'Target tanggal', type: 'date' },
            {
              key: 'status',
              label: 'Status',
              type: 'select',
              options: [
                { value: 'draft', label: 'Draft' },
                { value: 'active', label: 'Aktif' },
                { value: 'done', label: 'Selesai' },
              ],
            },
          ],
          defaults: { title: '', target: '', saved: '0', targetDate: '', status: '' },
        },
        piutang: {
          title: 'piutang',
          description: 'Catat uang yang harus dikembalikan kepada kamu.',
          fields: [
            { key: 'person', label: 'Nama orang', placeholder: 'Contoh: Budi' },
            { key: 'amount', label: 'Nominal', type: 'number' },
            { key: 'source', label: 'Sumber', placeholder: 'Pinjaman / split bill' },
            { key: 'date', label: 'Tanggal', type: 'date' },
          ],
          defaults: { person: '', amount: '', source: 'Pinjaman', date: today },
        },
        budget: {
          title: 'anggaran',
          description: 'Tetapkan batas per kategori untuk periode berjalan.',
          fields: [
            ...catFields(() => EXPENSE_TREE),
            { key: 'allocated', label: 'Alokasi', type: 'number' },
            { key: 'spent', label: 'Sudah terpakai', type: 'number' },
          ],
          defaults: { catL1: '', catL2: '', catL3: '', catCustom: '', allocated: '', spent: '0' },
        },
        periode: {
          title: 'periode',
          description: 'Atur rentang waktu yang dipakai untuk anggaran dan laporan.',
          fields: [
            { key: 'alias', label: 'Nama periode', placeholder: 'Periode Juli' },
            { key: 'start', label: 'Tanggal mulai', type: 'date' },
            { key: 'end', label: 'Tanggal selesai', type: 'date' },
          ],
          defaults: { alias: '', start: today, end: nextMonthValue },
        },
        orang: {
          title: 'peserta',
          description: 'Tambahkan orang ke pembagian tagihan saat ini.',
          fields: [
            { key: 'name', label: 'Nama peserta', placeholder: 'Contoh: Doni' },
            { key: 'share', label: 'Porsi nominal', type: 'number' },
          ],
          defaults: { name: '', share: '' },
        },
        tabungan: {
          title: 'tabungan',
          description: 'Sisihkan uang untuk tujuan tertentu. Uang tetap di dompet yang dipilih, tapi dikunci dari "aman dibelanjakan".',
          fields: [
            { key: 'emoji', label: 'Ikon (emoji)', placeholder: '🎓' },
            { key: 'name', label: 'Nama tabungan', placeholder: 'Contoh: Uang Kuliah Jeje' },
            { key: 'walletId', label: 'Disimpan di dompet', type: 'select', options: debitWallets },
            { key: 'balance', label: 'Sisihkan sekarang', type: 'number' },
            { key: 'target', label: 'Target (opsional)', type: 'number' },
            { key: 'targetDate', label: 'Target tanggal (opsional)', type: 'date' },
          ],
          defaults: { emoji: '🎯', name: '', walletId: '', balance: '', target: '', targetDate: '' },
        },
        sisihkan: {
          title: 'sisihkan',
          description: 'Pindahkan dari saldo tersedia ke tabungan ini (dompet sama).',
          fields: [{ key: 'amount', label: 'Jumlah disisihkan', type: 'number' }],
          defaults: { amount: '' },
        },
        ambil: {
          title: 'ambil',
          description: 'Kembalikan sebagian tabungan ke saldo tersedia.',
          fields: [{ key: 'amount', label: 'Jumlah diambil', type: 'number' }],
          defaults: { amount: '' },
        },
        beneficiary: {
          title: 'pihak',
          description: 'Daftar pihak yang sering muncul di transaksi — gereja, keluarga, atau nama orang tertentu.',
          fields: [
            { key: 'name', label: 'Nama', placeholder: 'Contoh: Gereja, Keluarga, Budi' },
            { key: 'kind', label: 'Jenis', type: 'select', options: BENEFICIARY_KINDS },
            { key: 'note', label: 'Catatan (opsional)', placeholder: 'Mis. perpuluhan bulanan', optional: true },
          ],
          defaults: { name: '', kind: 'person', note: '' },
        },
        reminder: {
          title: 'pengingat',
          description: 'Catat to-do atau pengingat pada tanggal tertentu. Muncul di kalender bersama jatuh tempo langganan.',
          fields: [
            { key: 'title', label: 'Judul pengingat', placeholder: 'Contoh: Bayar SPP Jeje' },
            { key: 'date', label: 'Tanggal', type: 'date' },
            { key: 'amount', label: 'Nominal (opsional)', type: 'number', optional: true },
            { key: 'note', label: 'Catatan (opsional)', placeholder: 'Detail tambahan', optional: true },
          ],
          defaults: { title: '', date: today, amount: '', note: '' },
        },
      };
      return configs[type];
    },
    [walletOptions, debitWalletOptions, categoryOptions, savingOptions, budgetOptions, receivableOptions,
      beneficiaryOptions, merchantSuggestions, prefs.defaultWalletId],
  );

  // Notifikasi dan status bacanya tersimpan per akun di PostgreSQL.
  useEffect(() => {
    if (!auth.user || !auth.workspaceId) return;
    const supabase = getBrowserSupabase();
    const workspaceId = auth.workspaceId;
    const loadNotifications = async () => {
      const { data, error } = await supabase.from('notifications').select('*')
        .eq('workspace_id', workspaceId)
        .eq('user_id', auth.user!.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        console.error('Gagal memuat notifikasi Supabase', error);
        return;
      }
      const rows = data ?? [];
      setReadNotifs(rows.filter((row) => row.read_at).map((row) => row.id as string));
      setNotifications(rows.map((row) => ({
        id: row.id as string,
        title: row.title as string,
        body: row.body as string,
        when: new Date(row.created_at as string).toLocaleDateString(numLocale, {
          day: 'numeric',
          month: 'short',
        }),
        tone: row.type === 'budget_overrun' || row.type === 'subscription_renewal' ? 'r' : 'e',
        icon: row.type === 'budget_overrun'
          ? <Gauge />
          : row.type === 'reminder_due'
            ? <Calendar />
            : row.type === 'subscription_ending'
              ? <Recur />
              : <Card />,
      })));
    };
    void loadNotifications();
    const channel = supabase.channel(`firstfruit-notifications-${workspaceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `workspace_id=eq.${workspaceId}`,
      }, () => void loadNotifications())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [auth.user, auth.workspaceId, dataVersion, numLocale]);

  const toggleNotifRead = async (id: string) => {
    const isRead = readNotifs.includes(id);
    setReadNotifs((current) => isRead ? current.filter((entry) => entry !== id) : [...current, id]);
    const { error } = await getBrowserSupabase().from('notifications')
      .update({ read_at: isRead ? null : new Date().toISOString() })
      .eq('id', id);
    if (error) {
      setReadNotifs((current) => isRead ? [...current, id] : current.filter((entry) => entry !== id));
      notify(`Gagal mengubah notifikasi: ${error.message}`);
    }
  };
  const markAllRead = async () => {
    const before = readNotifs;
    setReadNotifs(notifications.map((entry) => entry.id));
    const { error } = await getBrowserSupabase().rpc('mark_all_notifications_read', {
      p_workspace_id: auth.workspaceId!,
    });
    if (error) {
      setReadNotifs(before);
      notify(`Gagal menandai notifikasi: ${error.message}`);
    }
  };
  const unreadCount = notifications.filter((entry) => !readNotifs.includes(entry.id)).length;

  useEffect(() => {
    repos.beneficiaries.list().then((people) =>
      setBeneficiaryOptions(
        people
          .filter((person) => !person.archived)
          // Diurutkan per jenis supaya <optgroup> tidak terpecah-pecah.
          .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
          .map((person) => ({ value: person.id, label: person.name, group: beneficiaryKindLabel(person.kind) })),
      ),
    );
  }, [repos, dataVersion]);

  useEffect(() => {
    repos.receivables.list().then((receivables) =>
      setReceivableOptions(
        receivables
          .filter((entry) => !entry.settled)
          .map((entry) => ({
            value: entry.id,
            label: `${entry.person} · ${formatIDR(entry.amount - (entry.paid ?? 0))} (${entry.source})`,
          })),
      ),
    );
  }, [repos, dataVersion]);

  useEffect(() => {
    repos.savings.list().then((savings) =>
      setSavingOptions(
        savings
          .filter((s) => !s.archived)
          .map((s) => ({ value: s.id, label: `${s.emoji ? s.emoji + ' ' : ''}${s.name}`, walletId: s.walletId })),
      ),
    );
  }, [repos, dataVersion]);

  useEffect(() => {
    repos.wallets.list().then((wallets) => {
      setWalletOptions(wallets.map((wallet) => ({ value: wallet.id, label: wallet.name })));
      setDebitWalletOptions(
        wallets.filter((w) => w.kind === 'debit').map((wallet) => ({ value: wallet.id, label: wallet.name })),
      );
    });
  }, [repos, dataVersion]);

  useEffect(() => {
    // Taksonomi bawaan sudah statis; di sini hanya kategori bebas milik pengguna yang dikumpulkan.
    Promise.all([repos.budgets.list(), repos.transactions.list()]).then(([budgets, txs]) => {
      setCategoryOptions(
        customCategories([...budgets.map((b) => b.category), ...txs.flatMap((t) => t.labels)]),
      );
      setBudgetOptions(budgets.map((b) => ({ value: b.id, label: b.category })));
      // Tempat yang pernah dipakai naik jadi saran teratas.
      const used = txs.map((t) => t.merchant?.trim()).filter((m): m is string => Boolean(m));
      const seen = new Set(used.map((m) => m.toLowerCase()));
      setMerchantSuggestions([...new Set(used), ...MERCHANT_SUGGESTIONS.filter((m) => !seen.has(m.toLowerCase()))]);
    });
  }, [repos, dataVersion]);

  useEffect(() => {
    if (sheet !== 'create') return;
    const config = formConfig(create.type);
    // Pengingat dibuat dari kalender: tanggal yang sedang dipilih dikirim lewat `name`.
    const presetDate = create.type === 'reminder' && !create.id && /^\d{4}-\d{2}-\d{2}$/.test(create.name || '')
      ? { date: create.name as string }
      : null;
    setForm({ ...config.defaults, ...presetDate });
    if (!create.id) return;

    const load = async () => {
      let data: unknown = null;
      if (create.type === 'wallet') data = await repos.wallets.get(create.id!);
      if (create.type === 'subscription') data = await repos.subscriptions.get(create.id!);
      if (create.type === 'planning') data = await repos.plans.get(create.id!);
      if (create.type === 'tabungan') data = await repos.savings.get(create.id!);
      if (create.type === 'piutang') data = await repos.receivables.get(create.id!);
      if (create.type === 'budget') data = await repos.budgets.get(create.id!);
      if (create.type === 'reminder') data = await repos.reminders.get(create.id!);
      if (create.type === 'beneficiary') data = await repos.beneficiaries.get(create.id!);
      if (create.type === 'periode') data = await repos.periods.get(create.id!);
      if (create.type === 'transaksi' || create.type === 'transfer') {
        data = await repos.transactions.get(create.id!);
      }
      if (!data) return;
      const record = data as Record<string, unknown>;

      const loaded = Object.fromEntries(
        config.fields
          .map((field) => {
            let value: unknown = record[field.key];
            if (field.key === 'txType') value = record.type;
            // Record dompet lama belum punya `medium` — turunkan dari `kind`.
            if (field.key === 'medium') value = record.medium ?? (record.kind === 'credit' ? 'credit' : 'bank');
            if (field.key === 'payer') value = record.type === 'income' ? record.recipient : undefined;
            if (field.key === 'incomeNature') value = record.type === 'income' ? record.nature : undefined;
            if (field.key === 'nature') value = record.type === 'income' ? undefined : record.nature;
            if (field.key === 'owed') value = record.owedAmount;
            if (field.type === 'date') value = value ? toDateInput(value as string) : undefined;
            return [field.key, value] as const;
          })
          // Hanya override default dengan nilai yang benar-benar ada — biar default
          // (mis. beneficiary 'self') bertahan untuk record lama yang belum punya field ini.
          .filter(([, value]) => value != null && value !== '')
          .map(([key, value]) => [key, String(value)]),
      );
      // Kategori tersimpan cuma satu string — dipecah kembali jadi tiga tingkat pilihan.
      const storedCategory = (record.labels as string[] | undefined)?.[0] ?? (record.category as string | undefined);
      const spread = spreadCategory(storedCategory);
      setForm({ ...config.defaults, ...loaded, ...(spread ?? {}) });
    };
    void load();
  }, [create, formConfig, repos, sheet]);

  const close = () => setSheet(null);

  const saveForm = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const id = create.id;
    const shouldUpdate = create.isEdit && Boolean(id);
    let extraNote = '';

    try {
      if (create.type === 'wallet') {
        const medium = (form.medium || 'bank') as WalletMedium;
        const payload = {
          name: form.name.trim(),
          // Akuntansi cuma mengenal aset vs liabilitas — e-wallet & tunai tetap 'debit'.
          kind: (medium === 'credit' ? 'credit' : 'debit') as 'debit' | 'credit',
          medium,
          balance: toNumber(form.balance),
          bank: medium === 'cash' ? undefined : form.bank.trim() || undefined,
          last4: medium === 'bank' || medium === 'credit' ? form.last4.trim().slice(-4) || undefined : undefined,
          phone: medium === 'ewallet' ? form.phone.trim() || undefined : undefined,
          creditLimit: medium === 'credit' ? toNumber(form.creditLimit) : undefined,
        };
        if (shouldUpdate) {
          const before = await repos.wallets.get(id!);
          await repos.wallets.update(id!, payload);
          const delta = payload.balance - (before?.balance ?? 0);
          if (before && delta !== 0) {
            extraNote = ` · selisih ${formatIDR(Math.abs(delta))} dicatat sebagai penyesuaian`;
          }
        } else {
          await repos.wallets.create(payload);
        }
      }

      if (create.type === 'beneficiary') {
        const payload = {
          name: form.name.trim(),
          kind: form.kind as BeneficiaryKind,
          note: form.note.trim() || undefined,
        };
        shouldUpdate
          ? await repos.beneficiaries.update(id!, payload)
          : await repos.beneficiaries.create(payload);
      }

      if (create.type === 'transaksi' || create.type === 'transfer') {
        // Jenis diambil dari form (satu form untuk pengeluaran / pemasukan / transfer).
        const type = (form.txType || 'expense') as 'expense' | 'income' | 'transfer';
        const isTransfer = type === 'transfer';
        const amount = toNumber(form.amount);
        const category = isTransfer ? '' : pickCategory(form);
        // "Untuk siapa" hanya berlaku untuk pengeluaran.
        const beneficiary: TxBeneficiary = !isTransfer && type === 'expense'
          ? ((form.beneficiary as TxBeneficiary) || 'self')
          : 'self';
        const owesBack = beneficiary === 'gift' || beneficiary === 'lent' || beneficiary === 'shared';
        // Pihak terkait: dipilih dari daftar, atau dibuat baru di tempat.
        let beneficiaryId: string | undefined;
        let beneficiaryName: string | undefined;
        if (!isTransfer && form.beneficiaryId && form.beneficiaryId !== 'none') {
          if (form.beneficiaryId === CATEGORY_CUSTOM) {
            const name = form.beneficiaryName.trim();
            if (name) {
              const created = await repos.beneficiaries.create({
                name,
                kind: (form.beneficiaryKind || 'person') as BeneficiaryKind,
              });
              beneficiaryId = created.id;
              beneficiaryName = created.name;
            }
          } else {
            beneficiaryId = form.beneficiaryId;
            beneficiaryName = (await repos.beneficiaries.get(form.beneficiaryId))?.name;
          }
        }
        // Nama orang untuk piutang: pakai isian khusus, kalau kosong pakai pihak terkait.
        const recipient = isTransfer
          ? undefined
          : type === 'income'
            ? beneficiaryName
            : owesBack ? form.recipient.trim() || beneficiaryName : beneficiaryName;
        // Sifat: pengeluaran pakai terencana/tak terduga, pemasukan pakai rutin/tidak rutin.
        const nature = (type === 'income' ? form.incomeNature : form.nature) || 'fixed';
        // Porsi yang jadi piutang: talangin = penuh, patungan = sebagian (default separuh).
        const owedAmount =
          beneficiary === 'lent' ? amount
            : beneficiary === 'shared' ? Math.min(amount, toNumber(form.owed) || Math.round(amount / 2))
              : 0;
        const budgetId = !isTransfer && type === 'expense' && form.budgetId && form.budgetId !== 'none'
          ? form.budgetId
          : undefined;
        // Pelunasan piutang: dipilih sendiri, atau ditebak dari nama pembayar + nominal
        // yang persis sama dengan salah satu piutang aktif.
        let settlesReceivableId: string | undefined;
        if (!isTransfer && type === 'income') {
          const chosen = form.settlesReceivableId;
          if (chosen && chosen !== 'none') {
            settlesReceivableId = chosen;
          } else if (recipient) {
            const open = await repos.receivables.list();
            const match = open.find(
              (entry) =>
                !entry.settled &&
                entry.person.trim().toLowerCase() === recipient.trim().toLowerCase() &&
                entry.amount - (entry.paid ?? 0) === amount,
            );
            settlesReceivableId = match?.id;
          }
        }
        const payload = {
          type,
          nature: nature as 'fixed' | 'unexpected',
          amount,
          walletId: form.walletId,
          toWalletId: isTransfer ? form.toWalletId : undefined,
          labels: isTransfer ? [] : [category],
          merchant: isTransfer ? undefined : form.merchant.trim() || undefined,
          budgetId,
          savingId: isTransfer && form.savingId !== 'none' ? form.savingId : undefined,
          beneficiaryId,
          settlesReceivableId,
          note: form.note.trim() || (isTransfer ? 'Transfer internal' : 'Transaksi'),
          beneficiary: isTransfer ? undefined : beneficiary,
          recipient,
          isReceivable: owedAmount > 0 || undefined,
          owedAmount: owedAmount > 0 ? owedAmount : undefined,
          date: toIso(form.date),
        };
        shouldUpdate
          ? await repos.transactions.update(id!, payload)
          : await repos.transactions.create(payload);
      }

      if (create.type === 'subscription') {
        const payload = {
          name: form.name.trim(),
          amount: toNumber(form.amount),
          walletId: form.walletId,
          category: pickCategory(form),
          cycle: form.cycle as 'weekly' | 'monthly' | 'quarterly' | 'yearly',
          startDate: new Date().toISOString(),
          endDate: form.endDate ? toIso(form.endDate) : null,
          nextBillingDate: toIso(form.nextBillingDate),
          reminderDaysBefore: toNumber(form.reminderDaysBefore),
          status: 'active' as const,
        };
        shouldUpdate
          ? await repos.subscriptions.update(id!, payload)
          : await repos.subscriptions.create(payload);
      }

      if (create.type === 'planning') {
        const payload = {
          title: form.title.trim(),
          target: toNumber(form.target),
          saved: toNumber(form.saved),
          targetDate: form.targetDate || undefined,
          status: form.status as 'draft' | 'active' | 'done',
        };
        shouldUpdate ? await repos.plans.update(id!, payload) : await repos.plans.create(payload);
      }

      if (create.type === 'tabungan') {
        const amount = toNumber(form.balance);
        const [wallets, savings] = await Promise.all([repos.wallets.list(), repos.savings.list()]);
        const wallet = wallets.find((w) => w.id === form.walletId);
        // Saldo tersedia = saldo dompet − yang sudah dikunci tabungan LAIN di dompet itu.
        const reservedOthers = savings
          .filter((s) => s.walletId === form.walletId && !s.archived && s.id !== id)
          .reduce((sum, sv) => sum + sv.balance, 0);
        const available = (wallet?.balance ?? 0) - reservedOthers;
        if (amount > available) {
          notify(`Saldo tersedia ${wallet?.name ?? 'dompet'} cuma ${formatIDR(available)}`);
          return;
        }
        const payload = {
          name: form.name.trim(),
          walletId: form.walletId,
          balance: amount,
          target: form.target ? toNumber(form.target) : undefined,
          targetDate: form.targetDate || undefined,
          emoji: form.emoji.trim() || '🎯',
        };
        shouldUpdate ? await repos.savings.update(id!, payload) : await repos.savings.create(payload);
      }

      if (create.type === 'sisihkan' || create.type === 'ambil') {
        const saving = id ? await repos.savings.get(id) : null;
        const amount = toNumber(form.amount);
        if (!saving || amount <= 0) {
          notify('Masukkan jumlah yang valid');
          return;
        }
        if (create.type === 'sisihkan') {
          const [wallets, savings] = await Promise.all([repos.wallets.list(), repos.savings.list()]);
          const wallet = wallets.find((w) => w.id === saving.walletId);
          const reservedOthers = savings
            .filter((s) => s.walletId === saving.walletId && !s.archived && s.id !== id)
            .reduce((sum, sv) => sum + sv.balance, 0);
          const available = (wallet?.balance ?? 0) - reservedOthers;
          if (amount > available) {
            notify(`Saldo tersedia ${wallet?.name ?? 'dompet'} cuma ${formatIDR(available)}`);
            return;
          }
          await repos.commands.adjustSaving(id!, amount, 'reserve');
        } else {
          if (amount > saving.balance) {
            notify(`Maksimal ${formatIDR(saving.balance)} bisa diambil`);
            return;
          }
          await repos.commands.adjustSaving(id!, amount, 'release');
        }
      }

      if (create.type === 'piutang') {
        const payload = {
          person: form.person.trim(),
          amount: toNumber(form.amount),
          source: form.source.trim() || 'Pinjaman',
          date: toIso(form.date),
          settled: false,
        };
        shouldUpdate
          ? await repos.receivables.update(id!, payload)
          : await repos.receivables.create(payload);
      }

      if (create.type === 'budget') {
        const payload = {
          category: pickCategory(form),
          allocated: toNumber(form.allocated),
          spent: toNumber(form.spent),
        };
        shouldUpdate ? await repos.budgets.update(id!, payload) : await repos.budgets.create(payload);
      }

      if (create.type === 'reminder') {
        const payload = {
          title: form.title.trim(),
          date: toIso(form.date),
          amount: form.amount ? toNumber(form.amount) : undefined,
          note: form.note.trim() || undefined,
          done: false,
        };
        shouldUpdate ? await repos.reminders.update(id!, payload) : await repos.reminders.create(payload);
      }

      if (create.type === 'periode') {
        const payload = {
          alias: form.alias.trim(),
          start: toIso(form.start),
          end: toIso(form.end),
          closed: false,
        };
        shouldUpdate ? await repos.periods.update(id!, payload) : await repos.periods.create(payload);
      }

      setDataVersion((version) => version + 1);
      close();
      const savedAmount = formatIDR(toNumber(form.amount));
      notify(
        create.type === 'orang'
          ? `${form.name || 'Peserta'} ditambahkan ke pembagian`
          : create.type === 'sisihkan'
            ? `${savedAmount} disisihkan ke ${create.name ?? 'tabungan'}`
            : create.type === 'ambil'
              ? `${savedAmount} diambil dari ${create.name ?? 'tabungan'}`
              : `${formConfig(create.type).title} berhasil ${shouldUpdate ? 'diperbarui' : 'disimpan'}${extraNote}`,
      );
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Data gagal disimpan');
    } finally {
      setSaving(false);
    }
  };

  const removeWallet = async (walletId: string): Promise<string> => {
    const [wallet, wallets] = await Promise.all([
      repos.wallets.get(walletId),
      repos.wallets.list(),
    ]);
    if (!wallet) return '';
    const fallback =
      wallets.find((entry) => entry.id === prefs.defaultWalletId && entry.id !== walletId && entry.kind === 'debit')
      ?? wallets.find((entry) => entry.id !== walletId && entry.kind === 'debit');

    if (wallet.balance > 0 && !fallback) {
      throw new Error('Buat atau pilih dompet debit tujuan sebelum mengarsipkan dompet ini');
    }
    await repos.commands.archiveWallet(walletId, fallback?.id);
    if (prefs.defaultWalletId === walletId) setPref('defaultWalletId', fallback?.id ?? '');
    if (wallet.balance <= 0 || !fallback) return '';
    return wallet.kind === 'credit'
      ? ` · sisa tagihan ${formatIDR(wallet.balance)} dibayar dari ${fallback.name}`
      : ` · saldo ${formatIDR(wallet.balance)} pindah ke ${fallback.name}`;
  };

  const removeItem = async () => {
    if (!item.id) {
      close();
      return;
    }
    try {
      let removalNote = '';
      if (item.type === 'wallet') removalNote = await removeWallet(item.id);
      if (item.type === 'subscription') await repos.subscriptions.remove(item.id);
      if (item.type === 'planning') await repos.plans.remove(item.id);
      if (item.type === 'tabungan') await repos.savings.remove(item.id);
      if (item.type === 'piutang') await repos.receivables.remove(item.id);
      if (item.type === 'budget') await repos.budgets.remove(item.id);
      if (item.type === 'reminder') await repos.reminders.remove(item.id);
      if (item.type === 'beneficiary') await repos.beneficiaries.remove(item.id);
      if (item.type === 'periode') await repos.periods.remove(item.id);
      if (item.type === 'transaksi' || item.type === 'transfer') {
        await repos.transactions.remove(item.id);
      }
      setDataVersion((version) => version + 1);
      close();
      notify(`${item.name} dihapus${removalNote}`);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Data gagal dihapus');
    }
  };

  const currentConfig = formConfig(create.type);
  const showBack = !(['home', 'wallets', 'tx', 'subs'] as Tab[]).includes(tab);
  const screens: Record<Tab, React.ReactNode> = {
    home: <HomeScreen />,
    wallets: <WalletsScreen />,
    tx: <TransactionsScreen />,
    subs: <SubscriptionsScreen />,
    budget: <BudgetScreen />,
    split: <SplitScreen />,
    piutang: <ReceivablesScreen />,
    planning: <PlanningScreen />,
    reports: <ReportsScreen />,
    calendar: <CalendarScreen />,
    people: <PeopleScreen />,
    tutup: <ClosingScreen />,
    profile: <ProfileScreen />,
  };

  const navButton = (entry: { tab: Tab; label: string; icon: React.ReactNode }) => (
    <button
      className={`side-link${tab === entry.tab ? ' on' : ''}`}
      key={entry.tab}
      onClick={() => go(entry.tab)}
    >
      {entry.icon}
      <span>{t(entry.label)}</span>
    </button>
  );

  return (
    <UICtx.Provider value={ui}>
      <div className="app">
        <aside className="sidebar">
          {/* Logo, bukan kartu akun. Sengaja satu baris tanpa keterangan di bawah nama:
              begitu ia jadi mark + nama + subjudul bertumpuk, bentuknya sama persis dengan
              kartu profil di dasar sidebar dan terbaca sebagai profil kedua. */}
          <button className="brand" onClick={() => go('home')} aria-label="Ke beranda">
            <span className="brand-logo" aria-hidden="true">
              <img className="brand-logo-light" src="/brand/logo.svg" alt="" />
              <img className="brand-logo-dark" src="/brand/logo-white.svg" alt="" />
            </span>
            <span className="wordmark">
              <b>First<span>Fruit</span></b>
              <small>Finance</small>
            </span>
          </button>
          <button
            className={`side-period${tab === 'tutup' ? ' on' : ''}`}
            onClick={() => go('tutup')}
            aria-label={t('side.switchPeriod')}
          >
            <Calendar />
            <span>{activePeriod?.alias ?? t('side.switchPeriod')}</span>
            <ChevronR />
          </button>
          <button className="side-cta" onClick={ui.openAdd} aria-label={t('side.logCta')}>
            <Plus /><span>{t('side.logCta')}</span>
          </button>
          {/* Daftar menu digulir sendiri; merek, CTA, dan kartu profil tetap di tempatnya. */}
          <div className="side-scroll">
            <div className="side-label">{t('side.main')}</div>
            <nav>{mainNavigation.map(navButton)}</nav>
            <div className="side-label">{t('side.tools')}</div>
            <nav>{toolNavigation.map(navButton)}</nav>
          </div>
          {/* Satu-satunya jalan ke Profil & preferensi dari sidebar — kartu ini sekaligus
              menunjukkan sedang masuk sebagai siapa, jadi link "Pengaturan" terpisah cuma
              menduplikasi tujuan yang sama. */}
          <button
            className={`side-profile${tab === 'profile' ? ' on' : ''}`}
            onClick={() => go('profile')}
            aria-label={t('side.settings')}
          >
            <span className="side-avatar">{prefs.name.trim()[0]?.toUpperCase() || 'A'}</span>
            <span><b>{prefs.name}</b><small>{t('side.mainAccount')}</small></span>
            <Chevron />
          </button>
        </aside>

        {/* Wash gradien beranda dilukis di .workspace, bukan di dalam layar, supaya ia bisa
            berada di belakang topbar juga — itu yang membuat bagian atas terbaca sebagai satu
            bidang utuh, bukan kartu gradien yang ditempel di bawah header. */}
        <main className={`workspace${tab === 'home' ? ' home' : ''}`}>
          {/* Topbar berada DI DALAM .viewport supaya ia menggulir menyambung dengan konten.
              Kalau ia jadi anak langsung .workspace (kolom flex setinggi layar), ia otomatis
              terpaku di atas — dan itulah yang dulu membuatnya terasa sticky. Kini hanya
              .nav yang sengaja dipaku, lewat margin-top:auto. */}
          <div className="viewport">
            <header className="topbar">
              {showBack ? (
                <button className="header-back" onClick={goBack} aria-label="Kembali">
                  <ArrowLeft />
                </button>
              ) : (
                <button className="avatar-btn" onClick={() => go('profile')} aria-label="Profil">{prefs.name.trim()[0]?.toUpperCase() || 'A'}</button>
              )}
              <div className="page-heading">
                <span>{t(`tab.${tab}.eyebrow`)}</span>
                <h1>{t(`tab.${tab}.title`)}</h1>
              </div>
              <button className="bell" onClick={ui.openNotif} aria-label="Notifikasi">
                <Bell />{unreadCount > 0 && <span className="bdot">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </button>
            </header>

            {/* Key dipasang di sini, bukan di .viewport: kalau di viewport, topbar ikut
                remount dan beranimasi ulang tiap kali data berubah. */}
            <div className="page" key={`${tab}-${dataVersion}`}>{screens[tab]}</div>
          </div>

          <div className="nav"><div className="navbar">
            <button className={`nav-btn${tab === 'home' ? ' on' : ''}`} onClick={() => go('home')}><Home />{t('nav.home')}</button>
            <button className={`nav-btn${tab === 'wallets' ? ' on' : ''}`} onClick={() => go('wallets')}><WalletIcon />{t('nav.wallets')}</button>
            <button className="fab" onClick={ui.openAdd} aria-label={t('side.logCta')}><Plus /></button>
            <button className={`nav-btn${tab === 'tx' ? ' on' : ''}`} onClick={() => go('tx')}><ListIcon />{t('nav.tx')}</button>
            {/* Layar kecil tidak punya sidebar, jadi seluruh alat keuangan dikumpulkan di sini. */}
            <button
              className={`nav-btn${MORE_TABS.includes(tab) ? ' on' : ''}`}
              onClick={() => setSheet('more')}
            >
              <Grid />{t('nav.more')}
            </button>
          </div></div>
        </main>

        <div className={`scrim${sheet ? ' show' : ''}`} onClick={close} />

        {/* Menu alat keuangan untuk layar kecil — isinya sama dengan sidebar desktop. */}
        <section className={`sheet${sheet === 'more' ? ' show' : ''}`} aria-label={t('nav.more')}>
          <button className="sheet-close" onClick={close} aria-label="Tutup"><Close /></button>
          <div className="grab" /><h3>{t('more.title')}</h3>
          <p className="lead">{t('more.lead')}</p>
          <div className="more-grid">
            {[...mainNavigation.filter((entry) => entry.tab !== 'home'), ...toolNavigation, ...extraNavigation].map((entry) => (
              <button
                key={entry.tab}
                className={`more-item${tab === entry.tab ? ' on' : ''}`}
                onClick={() => go(entry.tab)}
              >
                <span className="more-ic">{entry.icon}</span>
                <span>{t(entry.label)}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Pemilih pintasan beranda. Memakai grid yang sama dengan sheet "Lainnya" —
            polanya identik (petak alat, keadaan `on`), jadi tidak perlu gaya baru. */}
        <section className={`sheet${sheet === 'tools' ? ' show' : ''}`} aria-label={t('home.toolsEditTitle')}>
          <button className="sheet-close" onClick={close} aria-label="Tutup"><Close /></button>
          <div className="grab" /><h3>{t('home.toolsEditTitle')}</h3>
          <p className="lead">{t('home.toolsEditLead', { n: prefs.homeTools.length })}</p>
          <div className="more-grid">
            {HOME_SHORTCUTS.map((entry) => {
              const picked = prefs.homeTools.includes(entry.id);
              return (
                <button
                  key={entry.id}
                  className={`more-item${picked ? ' on' : ''}`}
                  onClick={() => toggleHomeTool(entry.id)}
                  aria-pressed={picked}
                >
                  <span className="more-ic">{entry.icon}</span>
                  <span>{t(entry.label)}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className={`sheet${sheet === 'notif' ? ' show' : ''}`} aria-label="Notifikasi">
          <button className="sheet-close" onClick={close} aria-label="Tutup"><Close /></button>
          <div className="grab" /><h3>{t('notif.title')}</h3>
          <p className="lead">{unreadCount > 0 ? t('notif.unread', { n: unreadCount }) : t('notif.allRead')}</p>
          {unreadCount > 0 && (
            <button className="notif-readall" onClick={() => void markAllRead()}><Check /> {t('notif.markAllRead')}</button>
          )}
          {notifications.length === 0 && (
            <div className="empty-state"><Bell /><b>{t('notif.emptyTitle')}</b><span>{t('notif.emptyBody')}</span></div>
          )}
          {notifications.map((entry) => {
            const isRead = readNotifs.includes(entry.id);
            return (
              <div className={`notif-item${isRead ? ' read' : ''}`} key={entry.id}>
                <div className={`ni ${entry.tone}`}>{entry.icon}</div>
                <div>
                  <div className="nt">{entry.title}</div>
                  <div className="nd">{entry.body}</div>
                  <div className={`nw${entry.tone === 'e' ? ' mint-text' : ''}`}>{entry.when}</div>
                </div>
                {/* Dibaca ditandai per notifikasi — membuka lonceng tidak lagi menghapus semuanya.
                    Titiknya digambar lewat ::before di CSS, jadi tombolnya tanpa anak. */}
                <button
                  className={`notif-read${isRead ? ' on' : ''}`}
                  onClick={() => void toggleNotifRead(entry.id)}
                  aria-label={isRead ? t('notif.markUnread') : t('notif.markRead')}
                  title={isRead ? t('notif.markUnread') : t('notif.markRead')}
                />
              </div>
            );
          })}
        </section>

        <section className={`sheet${sheet === 'item' ? ' show' : ''}`} aria-label="Tindakan item">
          <button className="sheet-close" onClick={close} aria-label="Tutup"><Close /></button>
          <div className="grab" /><h3>{item.name}</h3>
          <p className="item-sub">{item.type === 'tabungan' ? t('wallets.savingsLabel') : t(`tab.${
            item.type === 'transaksi' || item.type === 'transfer' ? 'tx' :
            item.type === 'subscription' ? 'subs' :
            item.type === 'planning' ? 'planning' :
            item.type === 'piutang' ? 'piutang' :
            item.type === 'budget' ? 'budget' :
            item.type === 'reminder' ? 'calendar' :
            item.type === 'periode' ? 'tutup' : 'wallets'
          }.title`)}</p>
          {item.type === 'tabungan' && (
            <>
              <button className="act" onClick={() => openCreate('sisihkan', false, item.name, item.id)}>
                <span className="ax"><Plus /></span> {t('wallets.setAside')}
              </button>
              <button className="act" onClick={() => openCreate('ambil', false, item.name, item.id)}>
                <span className="ax"><Download /></span> {t('wallets.take')}
              </button>
            </>
          )}
          {item.type !== 'piutang' && (
            <button className="act" onClick={() => openCreate(item.type, true, item.name, item.id)}>
              <span className="ax"><Pencil /></span> {t('common.edit')}
            </button>
          )}
          {/* Periode & tabungan tidak boleh diduplikat — keduanya harus unik. */}
          {item.type !== 'tabungan' && item.type !== 'periode' && (
            <button className="act" onClick={() => openCreate(item.type, false, item.name, item.id)}>
              <span className="ax"><Copy /></span> {t('common.duplicate')}
            </button>
          )}
          <button className="act danger" onClick={() => void removeItem()}>
            <span className="ax"><Trash /></span> {t('common.delete')}
          </button>
        </section>

        <section className={`sheet form-sheet${sheet === 'create' ? ' show' : ''}`} aria-label="Form data">
          <button className="sheet-close" onClick={close} aria-label="Tutup"><Close /></button>
          <div className="grab" />
          <h3>
            {create.type === 'sisihkan'
              ? `Sisihkan ke ${create.name ?? 'tabungan'}`
              : create.type === 'ambil'
                ? `Ambil dari ${create.name ?? 'tabungan'}`
                : `${create.isEdit ? 'Edit' : create.duplicate ? 'Duplikat' : 'Tambah'} ${currentConfig.title}`}
          </h3>
          <p className="lead">{currentConfig.description}</p>
          <form onSubmit={(event) => void saveForm(event)}>
            <div className="form-grid">
              {currentConfig.fields.filter((field) => !field.showIf || field.showIf(form)).map((field) => (
                <label className="input-field" key={field.key}>
                  <span>{field.labelOf ? field.labelOf(form) : field.label}</span>
                  {field.type === 'select' ? (
                    <select
                      value={form[field.key] || ''}
                      onChange={(event) => setForm(applyFieldChange(form, field.key, event.target.value))}
                      required={!field.optional}
                    >
                      <option value="" disabled>{t('common.choose')}</option>
                      {groupOptions(field.optionsOf ? field.optionsOf(form) : field.options).map(
                        ([group, options]) =>
                          group ? (
                            <optgroup label={group} key={group}>
                              {options.map((option) => (
                                <option value={option.value} key={option.value}>{option.label}</option>
                              ))}
                            </optgroup>
                          ) : (
                            options.map((option) => (
                              <option value={option.value} key={option.value}>{option.label}</option>
                            ))
                          ),
                      )}
                    </select>
                  ) : MONEY_FIELDS.has(field.key) ? (
                    <div className="money-input">
                      <span className="rp">Rp</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={groupThousands(form[field.key])}
                        placeholder={field.placeholder || '0'}
                        onChange={(event) => setForm({ ...form, [field.key]: event.target.value.replace(/\D/g, '') })}
                        required={!field.optional && !['creditLimit', 'target', 'owed'].includes(field.key)}
                      />
                    </div>
                  ) : (
                    // Field bersaran memakai dropdown milik aplikasi (bukan <datalist> bawaan
                    // browser) supaya tampilannya sama dengan select lain di form ini.
                    <div className={field.suggestions ? 'suggest-field' : undefined}>
                      <input
                        type={field.type || 'text'}
                        inputMode={field.type === 'number' ? 'numeric' : undefined}
                        value={form[field.key] || ''}
                        placeholder={field.placeholder}
                        autoComplete={field.suggestions ? 'off' : undefined}
                        onFocus={() => field.suggestions && setOpenSuggest(field.key)}
                        onBlur={() => field.suggestions && setOpenSuggest((current) => (current === field.key ? null : current))}
                        onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                        min={field.type === 'number' ? 0 : undefined}
                        required={!field.optional && !['bank', 'last4', 'creditLimit', 'endDate', 'targetDate', 'emoji', 'target', 'owed'].includes(field.key)}
                      />
                      {field.suggestions && openSuggest === field.key && (() => {
                        const typed = (form[field.key] || '').trim().toLowerCase();
                        const matches = field.suggestions
                          .filter((suggestion) => suggestion.toLowerCase().includes(typed))
                          .slice(0, 8);
                        if (matches.length === 0) return null;
                        return (
                          <div className="suggest-list">
                            {matches.map((suggestion) => (
                              <button
                                type="button"
                                key={suggestion}
                                // mousedown dipakai supaya pilihan terbaca sebelum input kehilangan fokus.
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  setForm({ ...form, [field.key]: suggestion });
                                  setOpenSuggest(null);
                                }}
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </label>
              ))}
            </div>
            <button className="cta" disabled={saving}>
              {saving
                ? 'Menyimpan...'
                : create.type === 'sisihkan'
                  ? 'Sisihkan'
                  : create.type === 'ambil'
                    ? 'Ambil'
                    : create.isEdit
                      ? 'Simpan perubahan'
                      : `Simpan ${currentConfig.title}`}
            </button>
          </form>
        </section>

        <div className={`toast${toast ? ' show' : ''}`}>{toast}</div>
      </div>
    </UICtx.Provider>
  );
}

function WorkspaceApp({
  initialPreferences,
  initialWorkspaceId,
}: {
  initialPreferences?: Preferences;
  initialWorkspaceId?: string | null;
}) {
  const { workspaceId } = useAuthWorkspace();
  const hydratedPreferences = workspaceId === initialWorkspaceId
    ? initialPreferences
    : undefined;
  return (
    <RepositoryProvider>
      <Inner key={workspaceId} initialPreferences={hydratedPreferences} />
    </RepositoryProvider>
  );
}

export default function AppShell({
  initialUser,
  initialWorkspaces,
  initialWorkspaceId,
  initialPreferences,
}: {
  initialUser?: SupabaseUser | null;
  initialWorkspaces?: WorkspaceAccess[];
  initialWorkspaceId?: string | null;
  initialPreferences?: Preferences;
}) {
  return (
    <AuthProvider
      initialUser={initialUser}
      initialWorkspaces={initialWorkspaces}
      initialWorkspaceId={initialWorkspaceId}
    >
      <AuthBoundary>
        <WorkspaceApp
          initialPreferences={initialPreferences}
          initialWorkspaceId={initialWorkspaceId}
        />
      </AuthBoundary>
    </AuthProvider>
  );
}
