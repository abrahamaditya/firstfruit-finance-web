import type { User } from '@supabase/supabase-js';

export interface Preferences {
  theme: 'dark' | 'light';
  language: 'ID' | 'EN';
  currency: 'IDR' | 'USD';
  notifications: boolean;
  hideHomeAmounts: boolean;
  name: string;
  email: string;
  defaultWalletId: string;
  homeTools: string[];
}

export const DEFAULT_HOME_TOOLS = ['log', 'transfer', 'split', 'budget'];
export const PROFILE_PLACEHOLDER_NAME = 'Pengguna FirstFruit';

export const DEFAULT_PREFS: Preferences = {
  theme: 'dark',
  language: 'ID',
  currency: 'IDR',
  notifications: true,
  hideHomeAmounts: false,
  name: '',
  email: '',
  defaultWalletId: '',
  homeTools: DEFAULT_HOME_TOOLS,
};

export const identityFromUser = (user: Pick<User, 'email' | 'user_metadata'>) => ({
  name: String(
    user.user_metadata.display_name
    ?? user.user_metadata.full_name
    ?? user.user_metadata.name
    ?? '',
  ).trim()
    || user.email?.split('@')[0]
    || PROFILE_PLACEHOLDER_NAME,
  email: user.email ?? '',
});

/**
 * `profiles.display_name` adalah sumber utama nama aplikasi. Metadata Auth dipakai
 * sebagai fallback untuk akun yang profilnya belum selesai dibootstrap.
 */
export const resolveDisplayName = (
  user: Pick<User, 'email' | 'user_metadata'>,
  profileName?: string | null,
) => {
  const storedName = profileName?.trim() ?? '';
  return storedName && storedName !== PROFILE_PLACEHOLDER_NAME
    ? storedName
    : identityFromUser(user).name;
};

export const displayNameMetadata = (displayName: string) => ({
  display_name: displayName,
  full_name: displayName,
  name: displayName,
});
