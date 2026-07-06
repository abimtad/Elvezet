import type { NextConfig } from "next";
import path from "node:path";

const apiImageOrigin = new URL(
  process.env.NEXT_PUBLIC_API_URL || 'https://elvezet-api-babey.onrender.com/api/v1',
);

const nextConfig: NextConfig = {
  // Allow Cursor/browser tooling that opens http://127.0.0.1:3000
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // @ts-ignore
  turbopack: {
    // The browser and API share the pure poster policy in ../src.
    root: path.resolve(process.cwd(), ".."),
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "5000",
        pathname: "/uploads/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "5000",
        pathname: "/uploads/**",
      },
    ],
  },
};

export default nextConfig;
