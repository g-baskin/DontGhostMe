import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      "node -e \"require('node:fs').rmSync('.local/e2e.sqlite',{force:true})\" && node --import tsx scripts/db-migrate.ts && node --import tsx scripts/db-seed.ts && next build && next start --hostname 127.0.0.1",
    env: { DATABASE_PATH: ".local/e2e.sqlite" },
    url: "http://127.0.0.1:3000",
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
  },
});
