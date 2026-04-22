import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { hostname: "www.google.com" },          // Google Favicons S2
      { hostname: "static2.finnhub.io" },      // Finnhub logo
      { hostname: "www.redditstatic.com" },     // Reddit icon
    ],
  },
};

export default nextConfig;
