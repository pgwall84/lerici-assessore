import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.8"],
  devIndicators: false,
  serverExternalPackages: ["sharp", "mailparser", "iconv-lite", "he"],
};

export default nextConfig;
