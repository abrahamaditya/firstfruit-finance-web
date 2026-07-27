import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'FirstFruit Finance',
    short_name: 'FirstFruit',
    description: 'Kelola dompet, anggaran, langganan, dan rencana keuangan pribadi.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0B0D0C',
    theme_color: '#0B0D0C',
    lang: 'id-ID',
    categories: ['finance', 'productivity'],
    icons: [
      {
        src: '/icons/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
