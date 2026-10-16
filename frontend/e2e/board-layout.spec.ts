import { expect, test, type Page } from '@playwright/test';

import { SESSION_ID, installFakeSocket, push, storeTokens } from './fake-session-socket';
import { manyFeatures, sessionState } from './state-fixtures';

/**
 * Budget de place de l'écran de session (FR-014c, T097b) : dans une fenêtre de 1280 × 560, la barre de session et la
 * barre d'actions tiennent chacune sur une ligne, 105 px au plus à elles deux, quel que soit l'état ; 15
 * fonctionnalités restent entièrement visibles et la page ne défile pas. Les messages se superposent au tableau sans
 * le décaler. Chaque tâche qui ajoute une action à une barre (T105, T113, T078, T079, T081, T083) ajoute ici l'état
 * qui la montre.
 */

/** Hauteur d'une barre d'une seule ligne : au-delà, un bouton est passé à la ligne. */
const SESSION_BAR_MAX = 56;
const ACTION_BAR_MAX = 49;
const BARS_MAX = 105;

const STATUSES = ['PREPARATION', 'IN_PROGRESS', 'CLOSED'] as const;

async function open(page: Page, animate: boolean, status: string): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 560 });
  await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'UP' } }));
  await installFakeSocket(page);
  await storeTokens(page, { animate });
  await page.goto(`/s/${SESSION_ID}`);
  await push(page, { ...sessionState(manyFeatures(20), { animate }), status });
  await expect(page.locator('tbody tr')).toHaveCount(20);
}

/** Hauteurs des deux barres, et vrai si un de leurs enfants déborde de la ligne. */
async function bars(page: Page) {
  return page.evaluate(() => {
    const measure = (selector: string) => {
      const bar = document.querySelector(selector) as HTMLElement;
      return {
        height: bar.getBoundingClientRect().height,
        overflow: bar.scrollWidth > bar.clientWidth,
      };
    };
    return { session: measure('.session-bar'), actions: measure('.action-bar') };
  });
}

for (const animate of [true, false]) {
  const who = animate ? 'animateur' : 'participant';
  for (const status of STATUSES) {
    test(`1280 × 560, ${who}, ${status} : deux barres d'une ligne, 15 fonctionnalités visibles`, async ({
      page,
    }) => {
      await open(page, animate, status);

      const { session, actions } = await bars(page);
      expect(session.height).toBeLessThanOrEqual(SESSION_BAR_MAX);
      expect(actions.height).toBeLessThanOrEqual(ACTION_BAR_MAX);
      expect(session.height + actions.height).toBeLessThanOrEqual(BARS_MAX);
      expect(session.overflow).toBe(false);
      expect(actions.overflow).toBe(false);

      // La barre de l'application cède la place à la barre de session.
      await expect(page.locator('app-top-bar')).toHaveCount(0);
      await expect(page.locator('.session-bar').getByRole('heading', { level: 1 })).toHaveText(
        'Atelier Q4',
      );

      for (const row of (await page.locator('tbody tr').all()).slice(0, 15)) {
        await expect(row).toBeInViewport({ ratio: 1 });
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
      ).toBe(true);
    });
  }
}

test('un refus de l’animateur se superpose au tableau sans le décaler', async ({ page }) => {
  await open(page, true, 'IN_PROGRESS');
  const before = await page.locator('tbody tr').first().boundingBox();

  await push(page, { type: 'error', code: 'INVALID_VALUE' });
  await expect(page.getByRole('alert')).toContainText("Une valeur est en dehors de l'échelle");

  expect(await page.locator('tbody tr').first().boundingBox()).toEqual(before);
});

test('la perte de connexion se superpose au tableau sans le décaler', async ({ page }) => {
  await open(page, false, 'IN_PROGRESS');
  const before = await page.locator('tbody tr').first().boundingBox();

  await page.evaluate(() =>
    (window as unknown as { __closeSocket: (code: number) => void }).__closeSocket(1006),
  );
  await expect(page.getByText('Reconnexion…')).toBeVisible();

  expect(await page.locator('tbody tr').first().boundingBox()).toEqual(before);
});

test('les actions de l’animateur gardent leur libellé, en groupes, dans la barre d’actions', async ({
  page,
}) => {
  await open(page, true, 'PREPARATION');
  const bar = page.getByRole('toolbar', { name: "Actions d'animation" });
  for (const name of ['+ Fonctionnalité', 'Prioriser par classement', 'Importer', 'Échelle']) {
    await expect(bar.getByRole('button', { name, exact: true })).toBeVisible();
  }
  // Outils communs, en haut à droite.
  const tools = page.locator('.session-bar');
  for (const name of [/^Participants \(2\)/, /^Liens/, 'Exporter', 'Tours révélés', /thème$/]) {
    await expect(tools.getByRole('button', { name })).toBeVisible();
  }
});
