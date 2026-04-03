import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Allow the ngrok domain to connect to the dev server
  images: { remotePatterns: [{ hostname: "*.ngrok-free.dev" }] }, // Optional: if using images
  async headers() {
    return [{
      source: "/:path*",
      headers: [{ key: "ngrok-skip-browser-warning", value: "true" }]
    }];
  }
};

export default nextConfig;
