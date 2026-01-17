import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
      ignoreDuringBuilds: true,
  }, 
  typescript: {
      ignoreBuildErrors: true
    },
  output: 'standalone'
};

export default nextConfig;
