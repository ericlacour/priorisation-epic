import { defineConfig, devices } from '@playwright/test';

/**
 * Parcours complets contre le vrai webservice (`e2e-journeys/`). Trois projets : Chromium, Firefox
 * et WebKit. Les serveurs (webservice et front) sont ajoutés avec les parcours.
 */
export default defineConfig({
  testDir: 'e2e-journeys',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: process.env['CI'] ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4300', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
