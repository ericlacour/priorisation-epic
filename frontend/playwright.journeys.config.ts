import { defineConfig, devices } from '@playwright/test';

/**
 * Parcours complets contre le vrai webservice (`e2e-journeys/`). Trois projets : Chromium, Firefox et WebKit.
 *
 * Deux serveurs sont démarrés : le webservice (le jar construit par `./mvnw package`, sur une base PostgreSQL
 * désignée par `DATABASE_URL`) et le front construit par `npm run build:e2e` avec `API_BASE_URL=http://127.0.0.1:4310`.
 */
export default defineConfig({
  testDir: 'e2e-journeys',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: process.env['CI'] ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4300', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'java -jar ../backend/target/priorisation-epic.jar',
      url: 'http://127.0.0.1:4310/api/health',
      timeout: 120_000,
      reuseExistingServer: !process.env['CI'],
      env: {
        PORT: '4310',
        ALLOWED_ORIGINS: 'http://127.0.0.1:4300',
        DATABASE_URL:
          process.env['DATABASE_URL'] ?? 'postgresql://ci:ci@localhost:5432/priorisation',
        // Les parcours créent beaucoup de sessions depuis la même adresse.
        PRIORISATION_EPIC_MAX_CREATIONS_PER_IP: '1000',
      },
    },
    {
      command: 'node scripts/serve-dist.mjs',
      url: 'http://127.0.0.1:4300/config.json',
      reuseExistingServer: !process.env['CI'],
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: process.env['PLAYWRIGHT_CHROMIUM_PATH'] || undefined },
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
