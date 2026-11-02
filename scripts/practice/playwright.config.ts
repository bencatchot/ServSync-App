import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "../../tests/practice",
  testMatch: "local.spec.ts",
  workers: 1,
  fullyParallel: false,
  outputDir: "../../test-results/practice",
  reporter: "list",
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:5193", trace: "retain-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } },
  ],
});
