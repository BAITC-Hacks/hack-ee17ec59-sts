import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node", include: ["tests/**/*.test.{ts,mjs}"],
    // Route and optimizer suites each build a 694k-row cache in their own worker.
    // Avoid competing cold searches; integration assertions also include sorting.
    fileParallelism: false,
    testTimeout: 15000,
  },
});
