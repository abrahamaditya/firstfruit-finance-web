'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getBrowserSupabase } from './browser';
import { isSupabaseConfigured } from './config';

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

export function useAuthWorkspace() {
  const value = useContext(AuthWorkspaceContext);
  if (!value) throw new Error('useAuthWorkspace must be used inside AuthProvider');
  return value;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<WorkspaceAccess[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const refreshWorkspaces = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const supabase = getBrowserSupabase();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setUser(null);
      setWorkspaces([]);
      setWorkspaceId(null);
      return;
    }
    setUser(authData.user);

    const { error: bootstrapError } = await supabase.rpc('ensure_user_bootstrap');
    if (bootstrapError) throw bootstrapError;

    const { data: memberships, error: membershipError } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('status', 'active');
    if (membershipError) throw membershipError;

    const ids = (memberships ?? []).map((entry) => entry.workspace_id as string);
    if (ids.length === 0) {
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

    const stored = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_KEY) : null;
    const selected = next.some((entry) => entry.id === stored) ? stored : next[0]?.id ?? null;
    setWorkspaceId(selected);
    if (selected) localStorage.setItem(WORKSPACE_KEY, selected);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    const supabase = getBrowserSupabase();
    let active = true;
    void refreshWorkspaces()
      .catch((error) => console.error('Gagal memuat workspace Supabase', error))
      .finally(() => active && setLoading(false));

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        setLoading(true);
        void refreshWorkspaces().finally(() => active && setLoading(false));
      } else {
        setWorkspaces([]);
        setWorkspaceId(null);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [refreshWorkspaces]);

  const switchWorkspace = useCallback((nextId: string) => {
    if (!workspaces.some((entry) => entry.id === nextId)) return;
    localStorage.setItem(WORKSPACE_KEY, nextId);
    setWorkspaceId(nextId);
  }, [workspaces]);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    await getBrowserSupabase().auth.signOut();
    localStorage.removeItem(WORKSPACE_KEY);
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
        <b>FIRST<span>FRUIT</span></b>
        <p>Dompet, anggaran, langganan, dan rencana keuangan dalam satu tempat.</p>
      </aside>
      <div className="auth-stage">{children}</div>
    </main>
  );
}

export function AuthBoundary({ children }: { children: React.ReactNode }) {
  const auth = useAuthWorkspace();
  if (!isSupabaseConfigured) return <SupabaseSetupRequired />;
  if (auth.loading) return <AuthLoading />;
  if (!auth.user) return <AuthScreen />;
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
        <div className="auth-brand"><img src="/brand/logo.svg" alt="" /><b>FIRST<span>FRUIT</span></b></div>
        <span className="auth-eyebrow">Pemulihan akun</span>
        <h1>Buat password baru</h1>
        <p>Gunakan minimal 10 karakter dan hindari password yang dipakai di layanan lain.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>Password baru</span>
            <input type="password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
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
        <div className="auth-command">npm run supabase:start</div>
        <p className="auth-hint">FirstFruit tidak kembali ke data demo agar data production tidak tercampur dengan seed lokal.</p>
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
          redirectTo: `${window.location.origin}/`,
        });
        if (resetError) throw resetError;
        setMessage('Tautan pemulihan sudah dikirim ke email Anda.');
      } else if (mode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name.trim() },
            emailRedirectTo: `${window.location.origin}/`,
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
        <div className="auth-brand"><img src="/brand/logo.svg" alt="" /><b>FIRST<span>FRUIT</span></b></div>
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
            <label>
              <span>Password</span>
              <input type="password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required />
              <small>Minimal 10 karakter</small>
            </label>
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
