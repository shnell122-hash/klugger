import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  basePath: '/dash',
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';
    return [
      { source: '/api/:path*', destination: `${api}/api/:path*` },
    ];
  },
};

export default nextConfig;
