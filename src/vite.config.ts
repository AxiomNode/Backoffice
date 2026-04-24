import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const secretsEnvPath = path.resolve(process.cwd(), ".env.secrets");
if (fs.existsSync(secretsEnvPath)) {
  const raw = fs.readFileSync(secretsEnvPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    exclude: ["node_modules/**", "dist/**", "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html", "lcov"],
      exclude: ["src/data/**", "e2e/**", "playwright.config.ts"],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 87.5,
      },
    },
  },
});