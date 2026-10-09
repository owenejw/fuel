import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Let phones on the same Wi-Fi use the dev server (e.g. http://192.168.0.31:3000).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.local"],
  serverExternalPackages: ["@electric-sql/pglite", "node-ical", "web-push"],
  experimental: {
    // Photos for plate logging / panel OCR are resized client-side, but allow headroom.
    serverActions: { bodySizeLimit: "6mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
