/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Memungkinkan verifikasi build berjalan berdampingan dengan `next dev` di Windows.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async headers() {
    return [{
      source: '/sw.js',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
    }];
  },
};
export default nextConfig;
