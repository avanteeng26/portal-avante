/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Só para pré-visualização local: NEXT_PUBLIC_SUPABASE_URL=/sb e SUPABASE_PROXY_TARGET=http://localhost:54321
  async rewrites() {
    const alvo = process.env.SUPABASE_PROXY_TARGET;
    return alvo ? [{ source: '/sb/:path*', destination: alvo + '/:path*' }] : [];
  },
};
export default nextConfig;
