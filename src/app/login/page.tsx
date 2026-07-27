import type { Metadata } from 'next';
import {
  AuthProvider,
  LoginBoundary,
} from '../../infrastructure/supabase/AuthProvider';

export const metadata: Metadata = {
  title: 'Masuk',
  description: 'Masuk ke akun FirstFruit Finance.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginPage() {
  return (
    <AuthProvider>
      <LoginBoundary />
    </AuthProvider>
  );
}
