import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from './config';

export async function createSupabaseServerClient() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase environment belum dikonfigurasi.');
  }
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components tidak dapat menulis cookie. middleware.ts menangani refresh.
        }
      },
    },
  });
}
