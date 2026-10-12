import { defineConfig, devices } from '@playwright/test';

/**
 * E2E du front construit, contre un faux socket (constitution IV : navigateurs récents du marché).
 * Trois projets : Chromium, Firefox et WebKit. Le serveur de fichiers statiques est ajouté avec
 * `scripts/serve-dist.mjs`.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  reporter: process.env['CI'] ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4300', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
