import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

/** Directory containing this config (LifeHub app root). Avoids Turbopack picking a parent folder when multiple lockfiles exist. */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  // Allow the ngrok domain to connect to the dev server
  images: { remotePatterns: [{ hostname: "*.ngrok-free.dev" }] }, // Optional: if using images
  async headers() {
    return [{
      source: "/:path*",
      headers: [{ key: "ngrok-skip-browser-warning", value: "true" }]
    }];
  },
  allowedDevOrigins: ["untensing-heike-burdensome.ngrok-free.dev"]
};

export default nextConfig;
