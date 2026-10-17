import { expect, test, type Page } from '@playwright/test';

import {
  SESSION_ID,
  installFakeSocket,
  push,
  sentOfType,
  storeTokens,
} from './fake-session-socket';
import { manyFeatures, sessionState } from './state-fixtures';

/**
 * Budget de place de l'écran de session (FR-014c, T097b) : dans une fenêtre de 1280 × 560, la barre de session et la
 * barre d'actions tiennent chacune sur une ligne, 105 px au plus à elles deux, quel que soit l'état ; 15
 * fonctionnalités restent entièrement visibles et la page ne défile pas. Les messages se superposent au tableau sans
 * le décaler. Chaque tâche qui ajoute une action à une barre (T105, T113, T078, T079, T081, T083) ajoute ici l'état
 * qui la montre : les trois statuts (préparation, en cours, clôturée) y sont depuis T113.
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

test('le cycle de vie : un seul bouton selon le statut, à droite de la barre d’actions (T113)', async ({
  page,
}) => {
  const labels = {
    PREPARATION: 'Démarrer la session',
    IN_PROGRESS: 'Clôturer la session',
    CLOSED: 'Rouvrir la session',
  } as const;
  for (const status of STATUSES) {
    await open(page, true, status);
    const lifecycle = page.getByRole('group', { name: 'Cycle de vie' });
    await expect(lifecycle.getByRole('button')).toHaveText([labels[status]]);
    const bar = await page.locator('.action-bar').boundingBox();
    const group = await lifecycle.boundingBox();
    // Calé à droite de la barre (16 px de marge intérieure).
    expect(Math.abs(bar!.x + bar!.width - 16 - (group!.x + group!.width))).toBeLessThanOrEqual(1);
  }
  // Session clôturée : le bandeau de lecture seule et « Rouvrir la session », rien d’autre.
  await expect(page.locator('.action-bar').getByRole('button')).toHaveText(['Rouvrir la session']);
  await expect(page.locator('.action-bar')).toContainText('Session clôturée : lecture seule');
  await expect(page.getByRole('button', { name: 'Modifier' })).toHaveCount(0);
});

test('la confirmation de clôture se superpose au tableau sans le décaler (T113)', async ({
  page,
}) => {
  await open(page, true, 'IN_PROGRESS');
  const before = await page.locator('tbody tr').first().boundingBox();

  await page.getByRole('button', { name: 'Clôturer la session' }).click();
  const dialog = page.getByRole('dialog', { name: 'Clôturer la session ?' });
  await expect(dialog).toContainText(
    'Elle passera en lecture seule pour tous. Vous pourrez la rouvrir.',
  );
  expect(await page.locator('tbody tr').first().boundingBox()).toEqual(before);

  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await sentOfType(page, 'changeStatus')).toEqual([]);

  await page.getByRole('button', { name: 'Clôturer la session' }).click();
  await page
    .getByRole('dialog', { name: 'Clôturer la session ?' })
    .getByRole('button', { name: 'Clôturer la session' })
    .click();
  expect(await sentOfType(page, 'changeStatus')).toEqual([
    { type: 'changeStatus', action: 'CLOSE' },
  ]);
});

test('le menu « Exporter » et son message se superposent au tableau sans le décaler (T105)', async ({
  page,
}) => {
  await open(page, false, 'IN_PROGRESS');
  await page.route('**/api/sessions/*/exports/csv', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/csv;charset=UTF-8',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Disposition',
        'Content-Disposition': 'attachment; filename="atelier-q4-tableau-v1.csv"',
      },
      body: '﻿Rang;Identifiant\r\n',
    }),
  );
  const before = await page.locator('tbody tr').first().boundingBox();

  await page.getByRole('button', { name: 'Exporter' }).click();
  await expect(page.getByRole('menu', { name: 'Exporter' })).toBeVisible();
  expect(await page.locator('tbody tr').first().boundingBox()).toEqual(before);
  const { session } = await bars(page);
  expect(session.height).toBeLessThanOrEqual(SESSION_BAR_MAX);

  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /Tableau CSV/ }).click();
  expect((await download).suggestedFilename()).toBe('atelier-q4-tableau-v1.csv');
  await expect(page.locator('.export-notice')).toContainText(
    'Fichier téléchargé : atelier-q4-tableau-v1.csv',
  );
  expect(await page.locator('tbody tr').first().boundingBox()).toEqual(before);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
  ).toBe(true);
});
