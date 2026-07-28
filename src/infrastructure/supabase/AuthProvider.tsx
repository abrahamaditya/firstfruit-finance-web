'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from './browser';
import { isSupabaseConfigured } from './config';
import { displayNameMetadata } from '../../core/preferences';
import { Eye, EyeOff } from '../../components/ui/icons';

export interface WorkspaceAccess {
  id: string;
  name: string;
  kind: 'personal' | 'family';
  role: 'owner' | 'editor' | 'viewer';
}

interface AuthWorkspaceContextValue {
  user: User | null;
  loading: boolean;
  workspaceId: string | null;
  workspace: WorkspaceAccess | null;
  workspaces: WorkspaceAccess[];
  passwordRecovery: boolean;
  switchWorkspace: (workspaceId: string) => void;
  refreshWorkspaces: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthWorkspaceContext = createContext<AuthWorkspaceContextValue | null>(null);
const WORKSPACE_KEY = 'firstfruit.workspace';

function readWorkspaceSelection() {
  if (typeof window === 'undefined') return null;
  const cookie = document.cookie
    .split('; ')
    .find(entry => entry.startsWith(`${WORKSPACE_KEY}=`))
    ?.split('=')[1];
  return cookie ? decodeURIComponent(cookie) : localStorage.getItem(WORKSPACE_KEY);
}

function persistWorkspaceSelection(workspaceId: string | null) {
  if (typeof window === 'undefined') return;
  if (workspaceId) {
    localStorage.setItem(WORKSPACE_KEY, workspaceId);
    document.cookie = `${WORKSPACE_KEY}=${encodeURIComponent(workspaceId)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } else {
    localStorage.removeItem(WORKSPACE_KEY);
    document.cookie = `${WORKSPACE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
}

export function useAuthWorkspace() {
  const value = useContext(AuthWorkspaceContext);
  if (!value) throw new Error('useAuthWorkspace must be used inside AuthProvider');
  return value;
}

export function AuthProvider({
  children,
  initialUser = null,
  initialWorkspaces = [],
  initialWorkspaceId = null,
}: {
  children: React.ReactNode;
  initialUser?: User | null;
  initialWorkspaces?: WorkspaceAccess[];
  initialWorkspaceId?: string | null;
}) {
  const initialSelection = initialWorkspaces.some(entry => entry.id === initialWorkspaceId)
    ? initialWorkspaceId
    : initialWorkspaces[0]?.id ?? null;
  const hasInitialAccess = Boolean(initialUser && initialSelection);
  const [user, setUser] = useState<User | null>(initialUser);
  const [loading, setLoading] = useState(!hasInitialAccess);
  const [workspaces, setWorkspaces] = useState<WorkspaceAccess[]>(initialWorkspaces);
  const [workspaceId, setWorkspaceId] = useState<string | null>(initialSelection);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const refreshWorkspaces = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const supabase = getBrowserSupabase();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    // Gangguan jaringan sementara tidak boleh dianggap sebagai sign-out karena itu
    // akan membongkar seluruh UI dan menghilangkan state form yang belum disimpan.
    if (authError) throw authError;
    if (!authData.user) {
      setUser(null);
      setWorkspaces([]);
      setWorkspaceId(null);
      return;
    }
    setUser(authData.user);

    const { error: bootstrapError } = await supabase.rpc('ensure_user_bootstrap');
    if (bootstrapError) {
      console.error('Gagal memastikan bootstrap akun Supabase', bootstrapError);
    }

    const { data: memberships, error: membershipError } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('status', 'active');
    if (membershipError) throw membershipError;

    const ids = (memberships ?? []).map((entry) => entry.workspace_id as string);
    if (ids.length === 0) {
      if (bootstrapError) throw bootstrapError;
      setWorkspaces([]);
      setWorkspaceId(null);
      return;
    }
    const { data: workspaceRows, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id, name, kind')
      .in('id', ids)
      .eq('status', 'active');
    if (workspaceError) throw workspaceError;

    const roleByWorkspace = new Map(
      (memberships ?? []).map((entry) => [entry.workspace_id as string, entry.role as WorkspaceAccess['role']]),
    );
    const next = (workspaceRows ?? []).map((entry) => ({
      id: entry.id as string,
      name: entry.name as string,
      kind: entry.kind as WorkspaceAccess['kind'],
      role: roleByWorkspace.get(entry.id as string) ?? 'viewer',
    }));
    setWorkspaces(next);

    const stored = readWorkspaceSelection();
    const selected = next.some((entry) => entry.id === stored) ? stored : next[0]?.id ?? null;
    setWorkspaceId(selected);
    persistWorkspaceSelection(selected);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    const supabase = getBrowserSupabase();
    let active = true;
    const initialRefresh = hasInitialAccess
      ? Promise.resolve()
      : refreshWorkspaces().catch((error) => console.error('Gagal memuat workspace Supabase', error));
    if (!hasInitialAccess) {
      void initialRefresh.finally(() => active && setLoading(false));
    }

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        const blocksInitialRender = !hasInitialAccess && event === 'INITIAL_SESSION';
        if (blocksInitialRender) setLoading(true);
        // TOKEN_REFRESHED dan USER_UPDATED hanya mengubah objek session/user.
        // Membership workspace tidak perlu dimuat ulang pada setiap tab focus.
        const needsWorkspaceRefresh = !hasInitialAccess
          && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN');
        if (needsWorkspaceRefresh) {
          void refreshWorkspaces()
            .catch((error) => console.error('Gagal menyegarkan workspace Supabase', error))
            .finally(() => {
              if (active && blocksInitialRender) setLoading(false);
            });
        } else if (blocksInitialRender) {
          setLoading(false);
        }
      } else {
        setWorkspaces([]);
        setWorkspaceId(null);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [hasInitialAccess, refreshWorkspaces]);

  const switchWorkspace = useCallback((nextId: string) => {
    if (!workspaces.some((entry) => entry.id === nextId)) return;
    persistWorkspaceSelection(nextId);
    setWorkspaceId(nextId);
  }, [workspaces]);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    await getBrowserSupabase().auth.signOut();
    persistWorkspaceSelection(null);
    setUser(null);
    setWorkspaces([]);
    setWorkspaceId(null);
  }, []);

  const value = useMemo<AuthWorkspaceContextValue>(() => ({
    user,
    loading,
    workspaceId,
    workspace: workspaces.find((entry) => entry.id === workspaceId) ?? null,
    workspaces,
    passwordRecovery,
    switchWorkspace,
    refreshWorkspaces,
    signOut,
  }), [loading, passwordRecovery, refreshWorkspaces, signOut, switchWorkspace, user, workspaceId, workspaces]);

  return <AuthWorkspaceContext.Provider value={value}>{children}</AuthWorkspaceContext.Provider>;
}

/**
 * Kerangka semua layar auth. Di layar lebar ia terbelah dua: panel merek yang mengisi sisi
 * kiri ujung ke ujung, dan panggung form di kanan — itu yang membuat layarnya terpakai penuh
 * alih-alih satu kartu kecil mengambang di tengah bidang kosong.
 * Di ponsel panel merek disembunyikan, jadi yang tersisa persis kartu terpusat seperti semula.
 */
function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <aside className="auth-pane" aria-hidden="true">
        <img src="/brand/logo.svg" alt="" />
        <span className="wordmark"><b>First<span>Fruit</span></b><small>Finance</small></span>
        <p>Dompet, anggaran, langganan, dan rencana keuangan dalam satu tempat.</p>
      </aside>
      <div className="auth-stage">{children}</div>
    </main>
  );
}

export function AuthBoundary({ children }: { children: React.ReactNode }) {
  const auth = useAuthWorkspace();
  const router = useRouter();

  useEffect(() => {
    if (isSupabaseConfigured && !auth.loading && !auth.user) {
      router.replace('/login');
    }
  }, [auth.loading, auth.user, router]);

  if (!isSupabaseConfigured) return <SupabaseSetupRequired />;
  if (auth.loading) return <AuthLoading />;
  if (!auth.user) return <AuthLoading />;
  if (auth.passwordRecovery) return <PasswordRecoveryScreen />;
  if (!auth.workspaceId) {
    return (
      <AuthShell>
        <div className="auth-card">
          <img src="/brand/logo.svg" alt="" />
          <h1>Workspace belum tersedia</h1>
          <p>Bootstrap akun belum selesai. Coba muat ulang atau keluar lalu masuk kembali.</p>
          <button className="cta" onClick={() => void auth.refreshWorkspaces()}>Coba lagi</button>
        </div>
      </AuthShell>
    );
  }
  return <>{children}</>;
}

export function LoginBoundary() {
  const auth = useAuthWorkspace();
  const router = useRouter();

  useEffect(() => {
    if (
      isSupabaseConfigured
      && !auth.loading
      && auth.user
      && !auth.passwordRecovery
    ) {
      router.replace('/');
    }
  }, [auth.loading, auth.passwordRecovery, auth.user, router]);

  if (!isSupabaseConfigured) return <SupabaseSetupRequired />;
  if (auth.loading || (auth.user && !auth.passwordRecovery)) return <AuthLoading />;
  if (auth.passwordRecovery) return <PasswordRecoveryScreen />;
  return <AuthScreen />;
}

/**
 * Field password dengan tombol lihat/sembunyikan.
 *
 * Ikonnya menggambarkan AKSI yang akan terjadi, bukan keadaan saat ini: selama password
 * tersembunyi tombolnya bermata terbuka ("tampilkan"), begitu terbaca ia berganti jadi
 * mata tercoret ("sembunyikan"). Dibaca terbalik — ikon sebagai lambang keadaan — tombol
 * itu jadi ambigu karena keadaannya sudah terlihat jelas dari isi field itu sendiri.
 *
 * Keadaan terlihat sengaja tidak diingat antar field maupun antar pergantian mode:
 * password yang tidak sengaja tertinggal terbaca di layar adalah risiko yang tidak
 * sebanding dengan kemudahan yang dihemat.
 */
function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label>
      <span>{label}</span>
      <div className="auth-password">
        <input
          type={visible ? 'text' : 'password'}
          minLength={10}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required
        />
        <button
          type="button"
          className="auth-eye"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Sembunyikan password' : 'Tampilkan password'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff /> : <Eye />}
        </button>
      </div>
      {hint && <small>{hint}</small>}
    </label>
  );
}

function PasswordRecoveryScreen() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { error: updateError } = await getBrowserSupabase().auth.updateUser({ password });
    if (updateError) setError(updateError.message);
    else setMessage('Password berhasil diperbarui. Muat ulang untuk melanjutkan.');
    setBusy(false);
  };

  return (
    <AuthShell>
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/brand/logo.svg" alt="" />
          <span className="wordmark"><b>First<span>Fruit</span></b><small>Finance</small></span>
        </div>
        <span className="auth-eyebrow">Pemulihan akun</span>
        <h1>Buat password baru</h1>
        <p>Gunakan minimal 10 karakter dan hindari password yang dipakai di layanan lain.</p>
        <form className="auth-form" onSubmit={submit}>
          <PasswordField
            label="Password baru"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
          {error && <div className="auth-error">{error}</div>}
          {message && <div className="auth-success">{message}</div>}
          <button className="cta" disabled={busy || Boolean(message)}>{busy ? 'Memproses…' : 'Simpan password'}</button>
        </form>
      </div>
    </AuthShell>
  );
}

function AuthLoading() {
  return (
    <AuthShell>
      <div className="auth-card auth-loading">
        <img src="/brand/logo.svg" alt="" />
        <span>Menyiapkan FirstFruit…</span>
      </div>
    </AuthShell>
  );
}

function SupabaseSetupRequired() {
  return (
    <AuthShell>
      <div className="auth-card">
        <img src="/brand/logo.svg" alt="" />
        <span className="auth-eyebrow">Setup diperlukan</span>
        <h1>Hubungkan Supabase</h1>
        <p>Salin <code>.env.example</code> menjadi <code>.env.local</code>, lalu isi URL dan publishable key Supabase.</p>
        <div className="auth-command">Hubungkan aplikasi ke project Supabase Cloud</div>
        <p className="auth-hint">FirstFruit tidak kembali ke data demo agar data production tidak tercampur dengan data akun.</p>
      </div>
    </AuthShell>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');
    const supabase = getBrowserSupabase();
    try {
      if (mode === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`,
        });
        if (resetError) throw resetError;
        setMessage('Tautan pemulihan sudah dikirim ke email Anda.');
      } else if (mode === 'signup') {
        const displayName = name.trim();
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: displayNameMetadata(displayName),
            emailRedirectTo: `${window.location.origin}/login`,
          },
        });
        if (signUpError) throw signUpError;
        setMessage('Akun dibuat. Periksa email jika verifikasi diwajibkan.');
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw loginError;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Autentikasi gagal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/brand/logo.svg" alt="" />
          <span className="wordmark"><b>First<span>Fruit</span></b><small>Finance</small></span>
        </div>
        <span className="auth-eyebrow">Keuangan yang rapi, keputusan yang tenang</span>
        <h1>{mode === 'signup' ? 'Buat akun' : mode === 'forgot' ? 'Pulihkan akun' : 'Selamat datang'}</h1>
        <p>
          {mode === 'signup'
            ? 'Workspace personal dan ledger aman dibuat otomatis.'
            : mode === 'forgot'
              ? 'Kami akan mengirim tautan pemulihan.'
              : 'Masuk untuk melanjutkan ke workspace Anda.'}
        </p>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && (
            <label><span>Nama</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
          )}
          <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          {mode !== 'forgot' && (
            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              // Password manager perlu tahu bedanya: 'new-password' memicu tawaran
              // membuatkan password baru, 'current-password' memicu pengisian otomatis.
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              hint="Minimal 10 karakter"
            />
          )}
          {error && <div className="auth-error">{error}</div>}
          {message && <div className="auth-success">{message}</div>}
          <button className="cta" disabled={busy}>{busy ? 'Memproses…' : mode === 'signup' ? 'Buat akun' : mode === 'forgot' ? 'Kirim tautan' : 'Masuk'}</button>
        </form>
        <div className="auth-links">
          {mode === 'login' ? (
            <>
              <button onClick={() => setMode('forgot')}>Lupa password?</button>
              <button onClick={() => setMode('signup')}>Belum punya akun</button>
            </>
          ) : (
            <button onClick={() => setMode('login')}>Kembali ke halaman masuk</button>
          )}
        </div>
      </div>
    </AuthShell>
  );
}
