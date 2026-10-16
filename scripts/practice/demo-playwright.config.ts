import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "../../tests/practice",
  testMatch: "demo-ui.spec.ts",
  workers: 1,
  fullyParallel: false,
  outputDir: "../../test-results/practice-demo",
  reporter: "list",
  timeout: 45000,
  use: { baseURL: "http://127.0.0.1:5194", trace: "retain-on-failure" },
  webServer: {
    command: "node --import tsx scripts/practice/demo-serve.ts",
    cwd: "../..",
    url: "http://127.0.0.1:5194",
    reuseExistingServer: false,
    timeout: 60000,
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } },
  ],
});
