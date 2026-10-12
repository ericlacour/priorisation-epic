import { defineConfig, devices } from '@playwright/test';

/**
 * Parcours complets contre le vrai webservice (`e2e-journeys/`). Trois projets : Chromium, Firefox
 * et WebKit. Deux serveurs sont démarrés : le webservice (jar construit par `./mvnw package`, sur
 * `DATABASE_URL`) et le front construit (`npm run build:e2e`, qui vise http://localhost:8080).
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
      url: 'http://localhost:8080/api/health',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
      env: {
        PORT: '8080',
        DATABASE_URL:
          process.env['DATABASE_URL'] ?? 'postgresql://pe:pe@localhost:5432/pe_journeys',
        ALLOWED_ORIGINS: 'http://127.0.0.1:4300,http://localhost:4300',
        // Les parcours créent plus de sessions que la limite de production.
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
        // Facultatif : un Chromium déjà installé (poste sans `npx playwright install`).
        launchOptions: { executablePath: process.env['PLAYWRIGHT_CHROMIUM_PATH'] || undefined },
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
