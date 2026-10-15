import { resolve } from 'node:path';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * US3 : préparer la session par import et régler l'échelle, contre le vrai webservice (quickstart V9 et V10).
 * Le fichier de 20 lignes dont 2 invalides est celui des tests du webservice. SC-001 : une session de
 * 20 fonctionnalités se prépare par import en moins de 5 minutes.
 */

// Les parcours se lancent depuis frontend/ (playwright.journeys.config.ts).
const TWENTY_LINES = resolve(
  '../backend/src/test/resources/imports/wsjf-20-lignes-2-invalides.xlsx',
);

const rows = (page: Page) => page.locator('tbody tr');
const rowTexts = async (page: Page) =>
  (await rows(page).allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());

async function createSession(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByLabel('Nom de la session').fill('Import');
  await page.getByLabel('Votre pseudo').fill('anim');
  await page.getByRole('button', { name: 'Créer la session' }).click();
  await expect(page.getByRole('heading', { name: 'Session créée' })).toBeVisible();
  const [invitation] = await page.locator('code').allInnerTexts();
  await page.getByRole('button', { name: 'Aller à la session' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Import' })).toBeVisible();
  return invitation;
}

async function openImport(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
}

async function openScale(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Échelle', exact: true }).click();
}

async function openParticipant(context: BrowserContext, invitation: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(invitation);
  await page.getByLabel('Votre pseudo').fill('alice');
  await page.getByRole('button', { name: 'Rejoindre' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Import' })).toBeVisible();
  return page;
}

test('V9 : modèle, aperçu de 20 lignes dont 2 rejetées, import chez tous (SC-001)', async ({
  page,
  browser,
}) => {
  const started = Date.now();
  const invitation = await createSession(page);
  const other = await browser.newContext();
  const alice = await openParticipant(other, invitation);

  await openImport(page);
  const dialog = page.getByRole('dialog', { name: 'Importer des fonctionnalités' });
  await expect(dialog).toContainText(
    'En-têtes attendus : Identifiant, Titre, Description, BV, TC, RR/OE, JS.',
  );

  // Le modèle se télécharge.
  const download = page.waitForEvent('download');
  await dialog.getByRole('link', { name: 'Télécharger le modèle Excel' }).click();
  expect((await download).suggestedFilename()).toBe('modele-import-wsjf.xlsx');

  // Un fichier sans en-tête « Titre » est refusé en entier.
  await dialog.getByLabel('Fichier à importer').setInputFiles({
    name: 'sans-titre.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Identifiant;BV\nF-1;3\n', 'utf8'),
  });
  await expect(dialog.getByRole('alert')).toContainText(
    "Le fichier n'a pas les colonnes obligatoires Identifiant et Titre",
  );

  // L'aperçu de 20 lignes dont 2 invalides, sans rien écrire.
  await dialog.getByLabel('Fichier à importer').setInputFiles(TWENTY_LINES);
  await expect(dialog.locator('.stat b')).toHaveText(['18', '2', '0']);
  await expect(dialog.getByRole('tab', { name: 'Rejetées (2)' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(dialog.getByRole('tabpanel')).toContainText('Identifiant vide');
  await expect(dialog.getByRole('tabpanel')).toContainText('Identifiant déjà utilisé');
  await expect(rows(alice)).toHaveCount(1);

  // Confirmation : 18 fonctionnalités chez tous.
  await dialog.getByRole('button', { name: 'Importer 18 lignes' }).click();
  await expect(dialog).toContainText('18 fonctionnalité(s) importée(s), 2 ligne(s) rejetée(s).');
  await dialog.getByRole('button', { name: 'Terminer' }).click();
  await expect(rows(page)).toHaveCount(18);
  await expect(rows(alice)).toHaveCount(18);
  expect(Date.now() - started).toBeLessThan(5 * 60_000);

  // Annuler un second import n'importe rien.
  await openImport(page);
  await dialog.getByLabel('Fichier à importer').setInputFiles({
    name: 'une-ligne.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Identifiant;Titre\nF-99;Annulée\n', 'utf8'),
  });
  await expect(dialog.getByRole('button', { name: 'Importer 1 ligne' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(rows(page)).toHaveCount(18);
  await other.close();
});

test('V10 : Fibonacci 13 avec des valeurs 4 et 10, avertissement puis hors échelle', async ({
  page,
  browser,
}) => {
  const invitation = await createSession(page);
  const other = await browser.newContext();
  const alice = await openParticipant(other, invitation);
  await openImport(page);
  const importDialog = page.getByRole('dialog', { name: 'Importer des fonctionnalités' });
  await importDialog.getByLabel('Fichier à importer').setInputFiles({
    name: 'valeurs.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Identifiant;Titre;BV;TC;RR/OE;JS\nF-1;Paiement;4;5;3;10\nF-2;Export;8;5;3;2\n',
      'utf8',
    ),
  });
  await importDialog.getByRole('button', { name: 'Importer 2 lignes' }).click();
  await importDialog.getByRole('button', { name: 'Terminer' }).click();
  await expect(rows(page)).toHaveCount(2);

  // Échelle 1 à 20 : 15 est accepté.
  await openScale(page);
  const dialog = page.getByRole('dialog', { name: 'Échelle des valeurs' });
  await dialog.getByLabel('Borne supérieure').fill('20');
  await dialog.getByRole('button', { name: 'Appliquer' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.board-info-text')).toContainText('Échelle 1 à 20');

  // Fibonacci 13 : les valeurs 4 et 10 de F-1 sont annoncées, rien ne change avant confirmation.
  await openScale(page);
  await dialog.getByRole('radio', { name: /Suite de Fibonacci/ }).click();
  await dialog.getByRole('combobox', { name: 'Borne supérieure' }).selectOption('13');
  await expect(dialog.locator('.chips li')).toHaveText(['1', '2', '3', '5', '8', '13']);
  await dialog.getByRole('button', { name: 'Appliquer' }).click();
  const warning = dialog.getByRole('alert');
  await expect(warning).toContainText('2 valeur(s) deviennent hors échelle.');
  await expect(warning).toContainText('F-1 : BV = 4, JS = 10');
  await expect(alice.locator('.board-info-text')).toContainText('Échelle 1 à 20');

  await dialog.getByRole('button', { name: 'Confirmer le changement' }).click();
  await expect(dialog).toHaveCount(0);
  for (const view of [page, alice]) {
    await expect(view.locator('.board-info-text')).toContainText(
      'Échelle Fibonacci 1, 2, 3, 5, 8, 13',
    );
    await expect
      .poll(() => rowTexts(view))
      .toEqual([
        expect.stringMatching(/^1 F-2 Export 8 5 3 2 16 8,00/),
        expect.stringMatching(/^— F-1 Paiement 4 5 3 10 — hors échelle/),
      ]);
  }
  await other.close();
});
