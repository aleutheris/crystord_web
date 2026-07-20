import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    // Dedicated port: never collides with a running `npm run dev` on 5173, so a test run can no
    // longer be silently handed to a dev server started with a different profile.
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Vite directly, not `npm run dev` — the latter runs `npm run config`, which rewrites the
    // tracked public/config.json from deploy_config.json's active profile. Runtime config is
    // stubbed per-page in e2e/fixtures.ts, so the served file is irrelevant to tests and a run
    // no longer mutates the working tree or depends on the active profile.
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
  },
})
