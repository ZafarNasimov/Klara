import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "eval/**/*.test.ts"],
    env: { DATA_BACKEND: "memory", MEMORY_PERSIST: "0", LLM_MODE: "mock", WEATHER_DISABLED: "1" },
  },
});
