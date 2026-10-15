import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import {
  SESSION_ID,
  installFakeSocket,
  push,
  sentOfType,
  storeTokens,
} from './fake-session-socket';
import { F1, F2, F3, sessionState } from './state-fixtures';

/** Ouvre la session de l'animateur avec un faux socket et un faux service d'import. */
async function open(page: Page): Promise<void> {
  await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'UP' } }));
  await page.route(`**/api/sessions/${SESSION_ID}/imports`, (route) =>
    route.fulfill({
      json: {
        previewId: '6f1c2b0a-3d4e-4f5a-9b8c-7d6e5f4a3b2c',
        sourceType: 'XLSX',
        expiresAt: '2026-10-11T14:15:00Z',
        validRows: Array.from({ length: 18 }, (_, i) => ({
          line: i + 2,
          externalId: `F-${i + 10}`,
          title: `Fonctionnalité ${i + 10}`,
          description: null,
          criteria: { bv: 8, tc: 5, rrOe: 3, js: 4 },
        })),
        rejectedRows: [
          { line: 7, externalId: 'F-1', reason: 'Identifiant déjà utilisé' },
          { line: 12, externalId: null, reason: 'Identifiant vide' },
        ],
        warnings: [{ line: 15, message: 'BV = 12 hors échelle : valeur ignorée' }],
        ignoredColumns: [],
      },
    }),
  );
  await page.route(`**/api/sessions/${SESSION_ID}/imports/*/confirm`, (route) =>
    route.fulfill({ json: { imported: 18, rejected: 2 } }),
  );
  await installFakeSocket(page);
  await storeTokens(page, { animate: true });
  await page.goto(`/s/${SESSION_ID}`);
  await push(page, sessionState([F1, F2, F3], { animate: true }));
  await expect(page.locator('tbody tr')).toHaveCount(3);
}

test.describe('import et échelle', () => {
  test('l’aperçu d’import, puis le récapitulatif ; accessibilité (axe-core)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page);
    await page.getByRole('button', { name: 'Importer', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Importer des fonctionnalités' });
    await expect(dialog).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await dialog.getByLabel('Fichier à importer').setInputFiles({
      name: 'epics-pi27.xlsx',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('x'),
    });
    await expect(dialog).toContainText('epics-pi27.xlsx · 20 lignes lues');
    await expect(dialog.locator('.stat b')).toHaveText(['18', '2', '1']);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    // La fenêtre tient dans 1280 × 720, boutons compris.
    await expect(dialog.getByRole('button', { name: 'Importer 18 lignes' })).toBeInViewport();

    await dialog.getByRole('button', { name: 'Importer 18 lignes' }).click();
    await expect(dialog).toContainText('18 fonctionnalité(s) importée(s), 2 ligne(s) rejetée(s).');
    await dialog.getByRole('button', { name: 'Terminer' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('l’échelle : avertissement SCALE_IMPACT, confirmation ; accessibilité (axe-core)', async ({
    page,
  }) => {
    await open(page);
    await page.getByRole('button', { name: 'Échelle', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Échelle des valeurs' });
    await dialog.getByRole('radio', { name: /Suite de Fibonacci/ }).click();
    await dialog.getByRole('combobox', { name: 'Borne supérieure' }).selectOption('13');
    await dialog.getByRole('button', { name: 'Appliquer' }).click();
    expect(await sentOfType(page, 'updateSettings')).toEqual([
      { type: 'updateSettings', scale: { type: 'FIBONACCI', max: 13 } },
    ]);

    await push(page, {
      type: 'error',
      code: 'SCALE_IMPACT',
      impactedValues: [
        { externalId: 'F-1', criterion: 'js', value: 4 },
        { externalId: 'F-3', criterion: 'bv', value: 6 },
      ],
    });
    await expect(dialog.getByRole('alert')).toContainText('F-1 : JS = 4');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await dialog.getByRole('button', { name: 'Confirmer le changement' }).click();
    expect((await sentOfType(page, 'updateSettings'))[1]).toEqual({
      type: 'updateSettings',
      scale: { type: 'FIBONACCI', max: 13 },
      confirm: true,
    });
    const fibonacci = sessionState([F1, F2, F3], { animate: true, version: 2 });
    await push(page, {
      ...fibonacci,
      scale: { type: 'FIBONACCI', max: 13, allowedValues: [1, 2, 3, 5, 8, 13] },
    });
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.board-info-text')).toContainText(
      'Échelle Fibonacci 1, 2, 3, 5, 8, 13',
    );
  });
});
