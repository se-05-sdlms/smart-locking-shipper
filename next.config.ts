import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: `${process.env.BACKEND_URL ?? "http://127.0.0.1:5005/api"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
