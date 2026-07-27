import type { Metadata, Viewport } from 'next';
import './globals.css';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'FirstFruit Finance',
    template: '%s · FirstFruit Finance',
  },
  description: 'Kelola dompet, anggaran, langganan, dan rencana keuangan pribadi.',
  applicationName: 'FirstFruit Finance',
  manifest: '/manifest.webmanifest',
  alternates: { canonical: '/' },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/favicon.svg', type: 'image/svg+xml', sizes: 'any' },
      { url: '/icons/favicon-96x96.png', type: 'image/png', sizes: '96x96' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/icons/apple-touch-icon.png', type: 'image/png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'FirstFruit Finance',
  },
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    url: '/',
    siteName: 'FirstFruit Finance',
    title: 'FirstFruit Finance',
    description: 'Kelola dompet, anggaran, langganan, dan rencana keuangan pribadi.',
    images: [
      {
        url: '/opengraph-image',
        width: 2400,
        height: 1260,
        alt: 'FirstFruit Finance — keuangan pribadi dalam satu tempat',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FirstFruit Finance',
    description: 'Kelola dompet, anggaran, langganan, dan rencana keuangan pribadi.',
    images: ['/opengraph-image'],
  },
};
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0D0C' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Tema dipasang sebelum paint pertama, kalau tidak layar sempat berkedip gelap
            dulu bagi pengguna tema terang. `suppressHydrationWarning` di <html> karena
            skrip ini mengubah atribut yang dirender server. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var p=JSON.parse(localStorage.getItem('abraham.prefs')||'{}');document.documentElement.dataset.theme=p.theme==='light'?'light':'dark'}catch(e){}`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
