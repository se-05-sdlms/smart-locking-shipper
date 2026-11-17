import type { NextConfig } from "next";

const nextConfig: NextConfig = process.env.NEXT_PUBLIC_API_BASE_URL ? {
  output: "export",
  images: { unoptimized: true },
} : {
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
