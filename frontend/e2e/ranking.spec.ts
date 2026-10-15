import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import {
  SESSION_ID,
  installFakeSocket,
  push,
  sentOfType,
  storeTokens,
} from './fake-session-socket';
import { F1, F2, F3, manyFeatures, sessionState } from './state-fixtures';

async function openAsFacilitator(page: Page, features: unknown[]): Promise<void> {
  await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'UP' } }));
  await installFakeSocket(page);
  await storeTokens(page, { animate: true });
  await page.goto(`/s/${SESSION_ID}`);
  await push(page, sessionState(features, { animate: true }));
  await page.getByRole('button', { name: 'Prioriser par classement' }).click();
}

/** F-1, F-2 et F-3 telles qu'enregistrées par le premier scénario. */
function saved(): unknown[] {
  return [
    { ...F1, version: 2, criteria: { bv: 5, tc: 5, rrOe: 3, js: 2 } },
    { ...F2, version: 1, criteria: { bv: 4, tc: 2, rrOe: 2, js: null } },
    { ...F3, version: 1, criteria: { bv: 4, js: 3 } },
  ];
}

/** Les valeurs affichées, dans l'ordre du classement, puis celles des non classées. */
const values = (page: Page) =>
  expect.poll(async () => {
    const read = (selector: string) =>
      page
        .locator(selector)
        .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
    return [
      ...(await read('.rank-ranked .rank-item input')),
      ...(await read('.rank-unranked .rank-item input')),
    ];
  });

test.describe('prioriser par classement (FR-015a)', () => {
  test('classer BV puis JS, ajuster les valeurs, puis revenir au tableau avec une modification par fonctionnalité', async ({
    page,
  }) => {
    await openAsFacilitator(page, [F1, F2, F3]);
    await expect(page.getByRole('heading', { name: 'Prioriser par classement' })).toBeVisible();

    await page.getByLabel('TC · Time Criticality').uncheck();
    await page.getByLabel('RR/OE · Risk Reduction / Opportunity Enablement').uncheck();
    await page.getByRole('button', { name: 'Commencer le classement' }).click();

    // BV : les valeurs actuelles sont gardées, F-1 (8), F-3 (6), F-2 (2) ; F-2 mise à égalité avec F-3.
    await values(page).toEqual(['8', '6', '2']);
    await page.getByRole('button', { name: 'Égalité avec au-dessus : F-2' }).click();
    await values(page).toEqual(['8', '6', '6']);
    // Saisir la valeur du premier niveau propose une valeur à tous les niveaux.
    await page.getByLabel('Valeur du premier niveau (BV)').fill('5');
    await values(page).toEqual(['5', '4', '4']);
    await page.getByRole('button', { name: 'Critère suivant' }).click();

    // JS : F-1 (4), F-2 (3), F-3 non classée ; F-3 classée puis montée en tête, F-2 vidée à la main.
    await values(page).toEqual(['4', '3', '']);
    await page.getByRole('button', { name: 'Classer en dernier : F-3' }).click();
    await values(page).toEqual(['4', '3', '2']);
    await page.getByRole('button', { name: 'Monter : F-3' }).click();
    await page.getByRole('button', { name: 'Monter : F-3' }).click();
    await expect(page.getByRole('button', { name: 'Monter : F-3' })).toBeDisabled();
    await page.getByLabel('Valeur du premier niveau (JS)').fill('3');
    await page.getByLabel('JS de F-2').fill('');
    await values(page).toEqual(['3', '2', '']);
    expect(await sentOfType(page, 'updateFeature')).toHaveLength(0);

    await page.getByRole('button', { name: 'Terminer et enregistrer' }).click();
    expect(await sentOfType(page, 'updateFeature')).toEqual([
      { type: 'updateFeature', featureId: F1.id, version: 1, criteria: { bv: 5, js: 2 } },
      { type: 'updateFeature', featureId: F2.id, version: 0, criteria: { bv: 4, js: null } },
      { type: 'updateFeature', featureId: F3.id, version: 0, criteria: { bv: 4, js: 3 } },
    ]);
    // L'écran attend la confirmation du serveur avant de rendre la main au tableau.
    await expect(page.getByText('Enregistrement…')).toBeVisible();
    await push(page, sessionState(saved(), { animate: true, version: 2 }));
    await expect(page.locator('table.board-table')).toBeVisible();
  });

  test('un refus du serveur garde l’écran ouvert et nomme la fonctionnalité non enregistrée', async ({
    page,
  }) => {
    await openAsFacilitator(page, [F1, F2, F3]);
    await page.getByLabel('TC · Time Criticality').uncheck();
    await page.getByLabel('RR/OE · Risk Reduction / Opportunity Enablement').uncheck();
    await page.getByLabel('JS · Job Size').uncheck();
    await page.getByRole('button', { name: 'Commencer le classement' }).click();
    await page.getByLabel('Valeur du premier niveau (BV)').fill('9');
    await page.getByRole('button', { name: 'Terminer et enregistrer' }).click();

    await push(page, { type: 'error', code: 'STALE_VERSION', featureId: F1.id });
    const alert = page.locator('.ranking-unsaved');
    await expect(alert).toContainText('La fonctionnalité a été modifiée entre-temps');
    await expect(alert).toContainText('F-1 (BV 9)');
    await page.getByRole('button', { name: 'Retour au tableau' }).click();
    await expect(page.locator('table.board-table')).toBeVisible();
  });

  test('glisser une fonctionnalité par sa poignée sur un niveau la met à égalité', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'Glisser-déposer HTML5 simulé de façon fiable sous Chromium',
    );
    await openAsFacilitator(page, [F1, F2, F3]);
    await page.getByRole('button', { name: 'Commencer le classement' }).click();

    await page
      .locator('.rank-item', { hasText: 'F-2' })
      .locator('.drag-handle')
      .dragTo(page.locator('.rank-level-body').first());
    await expect(page.locator('.rank-level')).toHaveCount(2);
    await values(page).toEqual(['8', '8', '6']);
  });

  test('un clic dans une valeur la sélectionne pour la modifier', async ({ page }) => {
    await openAsFacilitator(page, [F1, F2, F3]);
    await page.getByRole('button', { name: 'Commencer le classement' }).click();
    const value = page.getByLabel('BV de F-3');
    await value.click();
    await expect(value).toBeFocused();
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('7');
    await expect(value).toHaveValue('7');
  });

  test('« Annuler » revient au tableau sans rien envoyer', async ({ page }) => {
    await openAsFacilitator(page, [F1, F2]);
    await page.getByRole('button', { name: 'Commencer le classement' }).click();
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(page.locator('table.board-table')).toBeVisible();
    expect(await sentOfType(page, 'updateFeature')).toHaveLength(0);
  });

  test('1280 × 720 avec 50 fonctionnalités : la page ne défile pas, seule la liste défile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openAsFacilitator(page, manyFeatures(50));
    await page.getByRole('button', { name: 'Commencer le classement' }).click();
    await expect(page.locator('.rank-item')).toHaveCount(50);

    const fits = await page.evaluate(() => {
      const list = document.querySelector('.ranking-levels') as HTMLElement;
      return {
        page: document.documentElement.scrollHeight <= window.innerHeight,
        list: list.scrollHeight > list.clientHeight,
      };
    });
    expect(fits).toEqual({ page: true, list: true });
    await expect(page.getByRole('button', { name: 'Critère suivant' })).toBeInViewport();
    // Les non classées restent visibles à côté du classement, une ligne par fonctionnalité.
    await expect(page.locator('.rank-unranked')).toBeInViewport();
    const rowHeight = await page
      .locator('.rank-item')
      .first()
      .evaluate((row) => row.clientHeight);
    expect(rowHeight).toBeLessThanOrEqual(40);
  });

  test('fenêtre de 1280 × 560 : 15 fonctionnalités visibles, chacune à son niveau, sans défilement', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    const unvalued = (manyFeatures(15) as { criteria: object }[]).map((feature) => ({
      ...feature,
      criteria: { ...feature.criteria, bv: null },
    }));
    await openAsFacilitator(page, unvalued);
    for (const item of await page.locator('.ranking-feature-list .check').all()) {
      await expect(item).toBeInViewport({ ratio: 1 });
    }
    await page.getByRole('button', { name: 'Commencer le classement' }).click();
    // « Classer en dernier » sur chaque non classée : 15 niveaux, le cas le plus haut.
    for (let index = 0; index < 15; index++) {
      await page.locator('.rank-unranked [data-action="last"]').first().click();
    }
    await expect(page.locator('.rank-level')).toHaveCount(15);
    for (const item of await page.locator('.rank-ranked .rank-item').all()) {
      await expect(item).toBeInViewport({ ratio: 1 });
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
    ).toBe(true);
  });

  test('accessibilité : aucune violation axe sur le choix et le classement', async ({ page }) => {
    await openAsFacilitator(page, [F1, F2, F3]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Commencer le classement' }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
