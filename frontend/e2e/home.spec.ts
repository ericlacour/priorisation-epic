import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { REACH_EFFORT, SESSION_ID, WSJF } from '../src/app/testing/fixtures';

const wcag = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

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

test('création : formulaire puis liens de la session créée, sans défaut d’accessibilité', async ({
  page,
}) => {
  await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'UP' } }));
  await page.route('**/api/methods', (route) => route.fulfill({ json: [WSJF, REACH_EFFORT] }));
  await page.route('**/api/sessions', (route) =>
    route.fulfill({
      status: 201,
      json: { sessionId: SESSION_ID, participantToken: 'p-tok', animationToken: 'a-tok' },
    }),
  );
  await page.goto('/');
  await expect(page.getByLabel('Méthode de priorisation')).toContainText('WSJF (version 1)');
  expect((await wcag(page)).violations).toEqual([]);

  await page.getByRole('button', { name: 'Voir le détail de la méthode' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect((await wcag(page)).violations).toEqual([]);
  await page.keyboard.press('Escape');

  await page.getByLabel('Nom de la session').fill('PI 27');
  await page.getByLabel('Votre pseudo').fill('eric');
  await page.getByRole('button', { name: 'Créer la session' }).click();
  await expect(page.getByText('Votre session est prête')).toBeVisible();
  await expect(page.getByText(`/s/${SESSION_ID}/animer#a-tok`)).toBeVisible();
  expect((await wcag(page)).violations).toEqual([]);
});
