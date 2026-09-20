import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["nodemailer", "imapflow", "mailparser", "pg"],
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
};

export default nextConfig;
