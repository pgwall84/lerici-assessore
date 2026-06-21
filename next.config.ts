import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.8"],
  devIndicators: false,
  experimental: {
    serverComponentsExternalPackages: ["sharp"],
  },
};

export default nextConfig;
