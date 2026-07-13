import type { NextConfig } from 'next';

// NEXT_STATIC_EXPORT=true → Cloudflare Pages build (no server, no rewrites)
// Default (undefined) → PM2 server mode with Express proxy on localhost
const isStatic = process.env.NEXT_STATIC_EXPORT === 'true';
const BACKEND_INTERNAL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3010';

const nextConfig: NextConfig = isStatic
  ? {
      output: 'export',
      trailingSlash: true,
      // Required for static export — Next.js Image optimizer is server-side only
      images: { unoptimized: true },
    }
  : {
      async rewrites() {
        return [
          {
            // Next.js server proxea /api/* → backend Express en localhost:3010
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
