import type { NextConfig } from 'next';

const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
const engineUrl = process.env.ENGINE_URL || 'http://localhost:8081';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*.dev.coze.site'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    return [
      // ── Bootstrap stays on Python backend (needs LLM) ──
      {
        source: '/api/v1/datasources/:id/bootstrap',
        destination: `${backendUrl}/api/v1/datasources/:id/bootstrap`,
      },
      {
        source: '/api/v1/datasources/:id/bootstrap/latest',
        destination: `${backendUrl}/api/v1/datasources/:id/bootstrap/latest`,
      },
      {
        source: '/api/v1/datasources/:id/bootstrap-preview',
        destination: `${backendUrl}/api/v1/datasources/:id/bootstrap-preview`,
      },

      // ── Migrated endpoints → ontop-engine (Java) ──
      {
        source: '/api/v1/datasources/:path*',
        destination: `${engineUrl}/api/v1/datasources/:path*`,
      },
      {
        source: '/api/v1/endpoint-registry/:path*',
        destination: `${engineUrl}/api/v1/endpoint-registry/:path*`,
      },
      {
        source: '/api/v1/mappings/:path*',
        destination: `${engineUrl}/api/v1/mappings/:path*`,
      },
      {
        source: '/api/v1/ontology/:path*',
        destination: `${engineUrl}/api/v1/ontology/:path*`,
      },
      {
        source: '/api/v1/sparql/:path*',
        destination: `${engineUrl}/api/v1/sparql/:path*`,
      },
      {
        source: '/api/v1/repositories/:path*',
        destination: `${engineUrl}/api/v1/repositories/:path*`,
      },
      {
        source: '/api/v1/repositories',
        destination: `${engineUrl}/api/v1/repositories`,
      },

      // ── Everything else → Python backend ──
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
