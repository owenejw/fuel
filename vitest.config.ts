import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Server modules import "server-only"; it only matters to the Next.js bundler.
      "server-only": path.resolve(__dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
