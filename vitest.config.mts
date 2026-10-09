import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node", include: ["tests/**/*.test.ts"], globals: true,
    setupFiles: ["./tests/setup.ts"], fileParallelism: false, testTimeout: 15000, hookTimeout: 20000,
  },
});
