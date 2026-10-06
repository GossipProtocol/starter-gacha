import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Pin the workspace root to this folder. Without it Turbopack can walk up
  // to a parent directory that holds other lockfiles and scan all of it.
  turbopack: { root: __dirname },
  // Real product photography drops into /public/tees as local files, so no
  // remote image config is needed for the mock. When we wire a CDN for the
  // house photo pipeline, add its host to images.remotePatterns here.
  reactStrictMode: true,
};

export default nextConfig;
