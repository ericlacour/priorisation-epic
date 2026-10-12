import { expect, test } from '@playwright/test';

test('la page d’accueil se charge avec le nom de l’application', async ({ page }) => {
  // Le webservice est simulé : `/api/health` répond 200, l'écran de réveil laisse la place à l'accueil.
  await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'UP' } }));
  await page.goto('/');
  await expect(page).toHaveTitle('Priorisation Fonctionnalités');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Priorisation Fonctionnalités' }),
  ).toBeVisible();
  await expect(page.locator('.brand-mark')).toHaveText('PF');
});
