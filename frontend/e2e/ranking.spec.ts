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

/** Les valeurs affichées, dans l'ordre du classement. */
const values = (page: Page) =>
  expect.poll(() =>
    page
      .locator('.rank-item input')
      .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)),
  );

test.describe('prioriser par classement (FR-015a)', () => {
  test('classer BV puis JS, ajuster les valeurs, puis revenir au tableau avec une modification par fonctionnalité', async ({
    page,
  }) => {
    await openAsFacilitator(page, [F1, F2, F3]);
    await expect(page.getByRole('heading', { name: 'Prioriser par classement' })).toBeVisible();

    await page.getByLabel('TC · Time Criticality').uncheck();
    await page.getByLabel('RR/OE · Risk Reduction / Opportunity Enablement').uncheck();
    await page.getByRole('button', { name: 'Commencer le classement' }).click();

    // BV : F-1 (8), F-3 (6), F-2 (2), proposées 10, 9, 8 ; F-2 mise à égalité avec F-3.
    await values(page).toEqual(['10', '9', '8']);
    await page.getByRole('button', { name: 'Égalité avec au-dessus : F-2' }).click();
    await values(page).toEqual(['10', '9', '9']);
    await page.getByLabel('Valeur du premier niveau (BV)').fill('5');
    await values(page).toEqual(['5', '4', '4']);
    await page.getByRole('button', { name: 'Critère suivant' }).click();

    // JS : F-1 (4), F-2 (3), F-3 sans valeur ; F-3 montée en tête, F-2 vidée à la main.
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
    await expect(page.locator('table.board-table')).toBeVisible();
  });

  test('glisser une fonctionnalité sur un niveau la met à égalité', async ({
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
      .dragTo(page.locator('.rank-level-body').first());
    await expect(page.locator('.rank-level')).toHaveCount(2);
    await values(page).toEqual(['10', '10', '9']);
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
  });

  test('accessibilité : aucune violation axe sur le choix et le classement', async ({ page }) => {
    await openAsFacilitator(page, [F1, F2, F3]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Commencer le classement' }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
