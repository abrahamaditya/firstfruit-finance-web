import AppShell from '../components/AppShell';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { WorkspaceAccess } from '../infrastructure/supabase/AuthProvider';
import { createSupabaseServerClient } from '../infrastructure/supabase/server';
import {
  DEFAULT_HOME_TOOLS,
  DEFAULT_PREFS,
  resolveDisplayName,
  type Preferences,
} from '../core/preferences';

const WORKSPACE_KEY = 'firstfruit.workspace';

export default async function Page() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { error: bootstrapError } = await supabase.rpc('ensure_user_bootstrap');
  if (bootstrapError) {
    console.error('Gagal memastikan bootstrap akun di server', bootstrapError);
  }

  const { data: memberships, error: membershipError } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('status', 'active');
  if (membershipError) throw membershipError;

  const workspaceIds = (memberships ?? []).map(entry => entry.workspace_id as string);
  const { data: workspaceRows, error: workspaceError } = workspaceIds.length
    ? await supabase
      .from('workspaces')
      .select('id, name, kind')
      .in('id', workspaceIds)
      .eq('status', 'active')
    : { data: [], error: null };
  if (workspaceError) throw workspaceError;

  const roleByWorkspace = new Map(
    (memberships ?? []).map(entry => [
      entry.workspace_id as string,
      entry.role as WorkspaceAccess['role'],
    ]),
  );
  const workspaces: WorkspaceAccess[] = (workspaceRows ?? []).map(entry => ({
    id: entry.id as string,
    name: entry.name as string,
    kind: entry.kind as WorkspaceAccess['kind'],
    role: roleByWorkspace.get(entry.id as string) ?? 'viewer',
  }));

  const cookieStore = await cookies();
  const storedWorkspaceId = cookieStore.get(WORKSPACE_KEY)?.value ?? null;
  const initialWorkspaceId = workspaces.some(entry => entry.id === storedWorkspaceId)
    ? storedWorkspaceId
    : workspaces[0]?.id ?? null;

  const profilePromise = supabase
    .from('profiles')
    .select('display_name')
    .eq('user_id', user.id)
    .maybeSingle();
  const preferencePromise = initialWorkspaceId
    ? supabase
      .from('user_workspace_preferences')
      .select('*')
      .eq('user_id', user.id)
      .eq('workspace_id', initialWorkspaceId)
      .maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const [profileResult, preferenceResult] = await Promise.all([
    profilePromise,
    preferencePromise,
  ]);
  if (profileResult.error) {
    console.error('Gagal memuat profil awal', profileResult.error);
  }
  if (preferenceResult.error) {
    console.error('Gagal memuat preferensi awal', preferenceResult.error);
  }

  const preference = preferenceResult.data;
  const initialPreferences: Preferences = {
    theme: preference?.theme === 'light' ? 'light' : DEFAULT_PREFS.theme,
    language: preference?.language === 'EN' ? 'EN' : DEFAULT_PREFS.language,
    currency: preference?.display_currency === 'USD' ? 'USD' : DEFAULT_PREFS.currency,
    notifications: preference?.notifications_enabled ?? DEFAULT_PREFS.notifications,
    hideHomeAmounts: preference?.hide_home_amounts ?? DEFAULT_PREFS.hideHomeAmounts,
    name: resolveDisplayName(user, profileResult.data?.display_name),
    email: user.email ?? '',
    defaultWalletId: preference?.default_wallet_id ?? DEFAULT_PREFS.defaultWalletId,
    homeTools: Array.isArray(preference?.home_tools)
      ? preference.home_tools.filter((id: unknown): id is string => typeof id === 'string')
      : DEFAULT_HOME_TOOLS,
    walletOrder: Array.isArray(preference?.wallet_order)
      ? preference.wallet_order.filter((id: unknown): id is string => typeof id === 'string')
      : DEFAULT_PREFS.walletOrder,
  };

  return (
    <AppShell
      initialUser={user}
      initialWorkspaces={workspaces}
      initialWorkspaceId={initialWorkspaceId}
      initialPreferences={initialPreferences}
    />
  );
}
