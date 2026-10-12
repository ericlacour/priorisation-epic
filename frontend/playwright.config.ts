import { defineConfig, devices } from '@playwright/test';

/**
 * E2E du front construit, contre un faux socket (constitution IV : navigateurs récents du marché).
 * Trois projets : Chromium, Firefox et WebKit. Le front est servi par `scripts/serve-dist.mjs`
 * (construire d'abord avec `npm run build:e2e`).
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  reporter: process.env['CI'] ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4300', trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/serve-dist.mjs',
    url: 'http://127.0.0.1:4300/config.json',
    reuseExistingServer: !process.env['CI'],
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Facultatif : un Chromium déjà installé (poste sans `npx playwright install`).
        launchOptions: { executablePath: process.env['PLAYWRIGHT_CHROMIUM_PATH'] || undefined },
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
