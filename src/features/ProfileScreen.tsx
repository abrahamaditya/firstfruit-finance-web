'use client';

import React, { useState } from 'react';
import { useUI, useT, Preferences } from '../components/AppShell';
import { useWallets } from '../application/hooks';
import { Bell, Calendar, Chevron, ChevronR, Settings, User, WalletIcon } from '../components/ui/icons';
import { useAuthWorkspace } from '../infrastructure/supabase/AuthProvider';

function Seg({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mseg">
      {options.map((option) => (
        <button key={option} className={option === value ? 'on' : ''} onClick={() => onChange(option)}>{option}</button>
      ))}
    </div>
  );
}

export default function ProfileScreen() {
  const ui = useUI();
  const auth = useAuthWorkspace();
  const tr = useT();
  const { prefs, setPref } = ui;
  const { wallets } = useWallets();
  const debitWallets = wallets.filter((wallet) => wallet.kind === 'debit');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(prefs.name);
  const [email, setEmail] = useState(prefs.email);

  // Preferensi disimpan global + localStorage lewat context (bertahan antar-halaman & reload).
  function change<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPref(key, value);
    ui.notify(tr('profile.saved'));
  }

  const startEdit = () => {
    setName(prefs.name);
    setEmail(prefs.email);
    setEditing(true);
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await ui.saveProfile(name, email);
      setEditing(false);
      ui.notify(tr('profile.updated'));
    } catch (caught) {
      ui.notify(caught instanceof Error ? caught.message : 'Profil gagal diperbarui');
    }
  };

  const themeLight = tr('profile.themeLight');
  const themeDark = tr('profile.themeDark');
  const notifOn = tr('profile.on');
  const localeDate = prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const fxUpdated = ui.rateUpdated
    ? tr('profile.fxUpdated', { date: new Date(ui.rateUpdated).toLocaleDateString(localeDate) })
    : '';

  return (
    <>
      <div className="profile-card">
        <div className="pav">{prefs.name.trim()[0]?.toUpperCase() || 'A'}</div>
        <div className="profile-copy"><span>{tr('profile.owner')}</span><h2>{prefs.name}</h2><p>{prefs.email}</p></div>
        <button className="addg" onClick={startEdit}><User />{tr('profile.editProfile')}</button>
      </div>

      {editing && (
        <form className="profile-edit" onSubmit={(event) => void saveProfile(event)}>
          <label className="input-field"><span>{tr('profile.name')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('profile.namePlaceholder')} required />
          </label>
          <label className="input-field"><span>{tr('profile.email')}</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@contoh.com" />
          </label>
          <div className="profile-edit-actions">
            <button type="button" className="ghost-btn" onClick={() => setEditing(false)}>{tr('common.cancel')}</button>
            <button type="submit" className="cta compact">{tr('common.save')}</button>
          </div>
        </form>
      )}

      <div className="sec"><span className="t">{tr('profile.displayRegional')}</span></div>
      <div className="setg">
        <div className="set"><div className="si"><Settings /></div><div className="sl">{tr('profile.theme')}</div>
          <Seg options={[themeLight, themeDark]} value={prefs.theme === 'light' ? themeLight : themeDark} onChange={(v) => change('theme', v === themeLight ? 'light' : 'dark')} /></div>
        <div className="set"><div className="si"><Settings /></div><div className="sl">{tr('profile.language')}</div>
          <Seg options={['ID', 'EN']} value={prefs.language} onChange={(v) => change('language', v as 'ID' | 'EN')} /></div>
        <div className="set"><div className="si"><Settings /></div><div className="sl">{tr('profile.currency')}</div>
          <Seg options={['IDR', 'USD']} value={prefs.currency} onChange={(v) => change('currency', v as 'IDR' | 'USD')} /></div>
      </div>
      <p className="fx-note">{tr('profile.fxNote', { rate: ui.rate.toLocaleString(localeDate), updated: fxUpdated })}</p>

      <div className="sec"><span className="t">{tr('profile.money')}</span></div>
      <div className="setg">
        {auth.workspaces.length > 1 && (
          <div className="set">
            <div className="si"><User /></div>
            <div className="sl">Workspace</div>
            <select
              className="set-select"
              value={auth.workspaceId ?? ''}
              onChange={(event) => auth.switchWorkspace(event.target.value)}
            >
              {auth.workspaces.map((workspace) => (
                <option value={workspace.id} key={workspace.id}>
                  {workspace.name} · {workspace.role}
                </option>
              ))}
            </select>
          </div>
        )}
        {/* Dompet default dipakai saat dompet lain dihapus dan sebagai isian awal form. */}
        <div className="set">
          <div className="si"><WalletIcon /></div>
          <div className="sl">{tr('profile.defaultWallet')}</div>
          <select
            className="set-select"
            value={prefs.defaultWalletId}
            onChange={(event) => change('defaultWalletId', event.target.value)}
          >
            <option value="">{tr('profile.noDefaultWallet')}</option>
            {debitWallets.map((wallet) => (
              <option value={wallet.id} key={wallet.id}>{wallet.name}</option>
            ))}
          </select>
        </div>
        <button className="set set-button" onClick={() => ui.go('people')}>
          <div className="si"><User /></div>
          <div className="sl">{tr('profile.people')}</div>
          <ChevronR />
        </button>
      </div>
      <p className="fx-note">{tr('profile.defaultWalletNote')}</p>

      <div className="sec"><span className="t">{tr('profile.accountPeriod')}</span></div>
      <div className="setg">
        <div className="set"><div className="si"><Bell /></div><div className="sl">{tr('profile.notifications')}</div>
          <Seg options={[notifOn, tr('profile.off')]} value={prefs.notifications ? notifOn : tr('profile.off')} onChange={(v) => change('notifications', v === notifOn)} /></div>
        {/* Membuka daftar periode (sheet), bukan pindah layar — chevron ke bawah,
            sama seperti tombol periode di sidebar. */}
        <button className="set set-button" onClick={ui.openPeriods}><div className="si"><Calendar /></div><div className="sl">{tr('profile.closePeriod')}</div><Chevron /></button>
        <button className="set set-button danger-row" onClick={() => void ui.signOut()}><div className="si"><User /></div><div className="sl">{tr('profile.logout')}</div><ChevronR /></button>
      </div>

      <p className="app-version">FirstFruit Finance · versi 0.1.0</p>
    </>
  );
}
