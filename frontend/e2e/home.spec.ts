import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { WSJF } from './state-fixtures';

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

/** 25 sessions, trois animateurs et les trois statuts, de la plus récente à la plus ancienne. */
const MANY_SESSIONS = Array.from({ length: 25 }, (_, i) => ({
  sessionId: `Sess${String(i).padStart(2, '0')}xxxxxxxxxxxxxxxx`,
  name: i % 3 === 0 ? `PI ${40 - i} – Épics plateforme` : `Roadmap ${i}`,
  facilitatorPseudo: ['Camille', 'Éric', 'Sophie'][i % 3],
  createdAt: new Date(Date.UTC(2026, 9, 14 - i, 12)).toISOString(),
  status: (['IN_PROGRESS', 'PREPARATION', 'CLOSED'] as const)[i % 3 === 0 ? i % 2 : 2],
  method: 'WSJF',
  methodVersion: 2,
}));

async function homeWithManySessions(page: import('@playwright/test').Page) {
  await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'UP' } }));
  await page.route('**/api/methods', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/sessions', (route) => route.fulfill({ json: MANY_SESSIONS }));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(
    page.getByRole('table', { name: 'Liste des sessions' }).locator('tbody tr'),
  ).toHaveCount(25);
}

test('l’accueil tient dans 1280 × 720 : création à gauche, liste à droite, seule la liste défile (FR-026a)', async ({
  page,
}) => {
  await homeWithManySessions(page);

  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
  ).toBe(true);
  const form = (await page.locator('form.home-create').boundingBox())!;
  const list = (await page.locator('.session-list').boundingBox())!;
  expect(form.x + form.width).toBeLessThanOrEqual(list.x);
  expect(list.y + list.height).toBeLessThanOrEqual(720);
  const wrap = page.locator('.session-list-wrap');
  expect(await wrap.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

  // L'en-tête du tableau reste visible quand la liste défile.
  await wrap.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(page.getByRole('columnheader', { name: 'Nom' })).toBeInViewport();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('la liste des sessions se filtre par nom, animateur et statut (FR-026b, quickstart V13a)', async ({
  page,
}) => {
  await homeWithManySessions(page);
  const rows = page.getByRole('table', { name: 'Liste des sessions' }).locator('tbody tr');
  const count = page.locator('.session-list-head [role="status"]');

  await page.getByLabel('Nom', { exact: true }).fill('epic');
  await expect(rows).toHaveCount(9);
  await expect(rows.first().locator('mark')).toHaveText('Épic');
  await expect(count).toHaveText('9 sessions sur 25');

  const facilitator = page.getByLabel('Animateur', { exact: true });
  await facilitator.fill('camille');
  await expect(rows).toHaveCount(9);
  await page.getByRole('checkbox', { name: 'Clôturée' }).uncheck();
  await page.getByRole('checkbox', { name: 'En préparation' }).uncheck();
  await expect(rows).toHaveCount(5);
  await expect(rows.locator('.badge')).toHaveText(Array(5).fill('En cours'));

  await facilitator.fill('Inconnu');
  await facilitator.blur();
  await expect(page.locator('#filter-facilitator-error')).toHaveText(
    "Aucune session n'est animée par « Inconnu ». Choisissez un animateur dans la liste proposée.",
  );
  await expect(facilitator).toHaveAttribute('aria-invalid', 'true');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByLabel('Nom', { exact: true }).fill('zzz');
  await expect(page.getByText('Aucune session ne correspond aux filtres.')).toBeVisible();
  await page.getByRole('button', { name: 'Effacer les filtres' }).click();
  await expect(rows).toHaveCount(25);
  await expect(count).toHaveText('25 sessions sur 25');
});

test('fenêtre basse : le formulaire de création défile dans sa colonne, son bouton reste atteignable', async ({
  page,
}) => {
  await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'UP' } }));
  await page.route('**/api/methods', (route) => route.fulfill({ json: [WSJF] }));
  await page.route('**/api/sessions', (route) => route.fulfill({ json: MANY_SESSIONS }));
  await page.setViewportSize({ width: 1280, height: 420 });
  await page.goto('/');
  await expect(page.locator('#create-method')).toBeVisible();

  const form = page.locator('form.home-create');
  expect(await form.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const submit = page.getByRole('button', { name: 'Créer la session' });
  await expect(submit).not.toBeInViewport();
  // À la molette, comme l'utilisateur : un défilement par script passerait même un `overflow: hidden`.
  const box = (await form.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 40);
  await page.mouse.wheel(0, 2000);
  await expect(submit).toBeInViewport();
});

test('l’écran qui suit la création défile dans une fenêtre basse', async ({ page }) => {
  await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'UP' } }));
  await page.route('**/api/methods', (route) => route.fulfill({ json: [WSJF] }));
  await page.route('**/api/sessions', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 201,
          json: {
            sessionId: 'Qm7tY2wR9pLk4XcV8bNz3D',
            participantToken: 'participant-token',
            animationToken: 'animation-token',
          },
        })
      : route.fulfill({ json: [] }),
  );
  await page.setViewportSize({ width: 1280, height: 420 });
  await page.goto('/');
  await page.getByLabel('Nom de la session').fill('PI 29');
  await page.getByLabel('Votre pseudo').fill('Camille');
  await page.getByRole('button', { name: 'Créer la session' }).click();

  const go = page.getByRole('button', { name: 'Aller à la session' });
  await expect(go).toBeAttached();
  await expect(go).not.toBeInViewport();
  await page.mouse.move(640, 200);
  await page.mouse.wheel(0, 2000);
  await expect(go).toBeInViewport();
});
