/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Memungkinkan verifikasi build berjalan berdampingan dengan `next dev` di Windows.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};
export default nextConfig;
