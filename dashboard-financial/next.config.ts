import type { NextConfig } from 'next';

// En producción el browser necesita llegar al backend desde internet,
// por eso se usa la URL pública. En server-side rewrites apuntamos a localhost.
const BACKEND_INTERNAL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3010';

const nextConfig: NextConfig = {
  output: 'standalone',

  async rewrites() {
    return [
      {
        // El servidor Next.js proxea /api/* → backend Express en localhost:3010
        source: '/api/:path*',
        destination: `${BACKEND_INTERNAL}/api/:path*`,
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [{ key: 'X-Source', value: 'financial-dashboard' }],
      },
    ];
  },
};

export default nextConfig;
