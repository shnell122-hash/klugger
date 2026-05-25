import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  basePath: '/testing/v60',
  async rewrites() {
    return [
      // Proxy API and socket.io directly to Flask (bypasses basePath in sources)
      {
        source: '/api/:path*',
        destination: 'http://localhost:5007/api/:path*',
      },
    ];
  },
};

export default nextConfig;
