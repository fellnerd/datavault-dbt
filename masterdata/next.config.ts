import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker deployment
  output: 'standalone',
  
  // Ensure server-only modules don't get bundled for the client
  serverExternalPackages: ['mssql', 'tedious', 'bullmq', 'ioredis'],
  
  // Allow dev access from network IP (just the origin without path)
  allowedDevOrigins: ['10.0.0.25'],
  
  // Empty turbopack config to acknowledge we're using Turbopack
  turbopack: {},
  
  // Webpack config for handling native modules (fallback for non-Turbopack)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't bundle these modules on the client
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        dns: false,
        tls: false,
        fs: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
