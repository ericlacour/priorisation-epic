import AxeBuilder from '@axe-core/playwright';
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

test('la liste des sessions de l’accueil : la plus récente d’abord, accessible (FR-026)', async ({
  page,
}) => {
  await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'UP' } }));
  await page.route('**/api/methods', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/sessions', (route) =>
    route.fulfill({
      json: [
        {
          sessionId: 'Qm7tY2wR9pLk4XcV8bNz3D',
          name: 'PI 28 – Epics',
          facilitatorPseudo: 'Camille',
          createdAt: '2026-10-14T12:00:00Z',
          status: 'IN_PROGRESS',
          method: 'WSJF',
          methodVersion: 2,
        },
        {
          sessionId: 'Hn4cR8vT1kWq6ZsJ0dXe5F',
          name: 'PI 27 – Bilan',
          facilitatorPseudo: 'Éric',
          createdAt: '2026-09-30T12:00:00Z',
          status: 'CLOSED',
          method: 'WSJF',
          methodVersion: 2,
        },
      ],
    }),
  );
  await page.goto('/');

  const list = page.getByRole('table', { name: 'Liste des sessions' });
  await expect(list.locator('tbody tr')).toHaveText([
    /PI 28 – Epics\s*Camille\s*14\/10\/2026\s*WSJF v2\s*En cours/,
    /PI 27 – Bilan\s*Éric\s*30\/09\/2026\s*WSJF v2\s*Clôturée/,
  ]);
  await expect(list.getByRole('link', { name: 'Ouvrir la session PI 27 – Bilan' })).toHaveAttribute(
    'href',
    '/s/Hn4cR8vT1kWq6ZsJ0dXe5F',
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
