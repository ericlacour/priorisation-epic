import { readFile } from 'node:fs/promises';

import { expect, test, type Download, type Page } from '@playwright/test';

import { namePattern, uniqueName } from './session-name';

/**
 * US4 : exporter le tableau, contre le vrai webservice (quickstart V11 et V12). Le collage dans une vraie page
 * Confluence (SC-007) reste une étape manuelle, notée dans la description de la PR.
 */

const FEATURES = [
  'Identifiant;Titre;Description;BV;TC;RR/OE;JS',
  'F-1;Paiement en un clic;"Deux lignes,\navec ; et « guillemets »";8;5;3;4',
  'F-2;Export comptable;;2;2;2;3',
  'F-3;Recherche | filtres;;10;8;5;2',
  'F-4;Été indien;Accents éàç;5;6;2;5',
  'F-5;Incomplète;;6;;;',
].join('\n');

const rows = (page: Page) => page.locator('tbody tr');
const rowTexts = async (page: Page) =>
  (await rows(page).allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());

/** Crée une session « <base> … », au nom propre au parcours, et arrive sur son tableau. */
async function createSession(page: Page, base: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('Nom de la session').fill(uniqueName(base));
  await page.getByLabel('Votre pseudo').fill('anim');
  await page.getByRole('button', { name: 'Créer la session' }).click();
  await expect(page.getByRole('heading', { name: 'Session créée' })).toBeVisible();
  const [invitation] = await page.locator('code').allInnerTexts();
  await page.getByRole('button', { name: 'Aller à la session' }).click();
  await expect(page.getByRole('heading', { level: 1, name: namePattern(base) })).toBeVisible();
  return invitation;
}

async function importFile(page: Page, name: string, buffer: Buffer, lines: number): Promise<void> {
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Importer des fonctionnalités' });
  await dialog.getByLabel('Fichier à importer').setInputFiles({
    name,
    mimeType: 'application/octet-stream',
    buffer,
  });
  await dialog.getByRole('button', { name: `Importer ${lines} lignes` }).click();
  await dialog.getByRole('button', { name: 'Terminer' }).click();
  await expect(rows(page)).toHaveCount(lines);
}

async function exportFile(page: Page, item: string): Promise<Download> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter' }).click();
  await page.getByRole('menuitem', { name: item }).click();
  return download;
}

const contentOf = async (download: Download) => readFile((await download.path()) as string, 'utf8');

/** Le presse-papiers est remplacé par un enregistreur : ce que l'application y copie est relu par le test. */
async function recordClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const copied: Record<string, string>[] = [];
    (window as unknown as { copied: typeof copied }).copied = copied;
    class RecordedItem {
      constructor(readonly items: Record<string, Promise<Blob> | Blob>) {}
    }
    Object.defineProperty(window, 'ClipboardItem', { value: RecordedItem, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => undefined,
        write: async (items: RecordedItem[]) => {
          for (const item of items) {
            const entry: Record<string, string> = {};
            for (const [type, blob] of Object.entries(item.items)) {
              entry[type] = await (await blob).text();
            }
            copied.push(entry);
          }
        },
      },
    });
  });
}

test('V11 : CSV tableau, copie pour Confluence et wiki markup, dans l’ordre du tableau, pour tout membre', async ({
  page,
  browser,
}) => {
  const invitation = await createSession(page, 'Export');
  await importFile(page, 'fonctionnalites.csv', Buffer.from(FEATURES, 'utf8'), 5);
  await expect
    .poll(() => rowTexts(page))
    .toEqual([
      expect.stringMatching(/^1 F-3 Recherche \| filtres 10 8 5 2 23 11,50/),
      expect.stringMatching(/^2 F-1 Paiement en un clic 8 5 3 4 16 4,00/),
      expect.stringMatching(/^3 F-4 Été indien 5 6 2 5 13 2,60/),
      expect.stringMatching(/^4 F-2 Export comptable 2 2 2 3 6 2,00/),
      expect.stringMatching(/^— F-5 Incomplète 6/),
    ]);

  // Un participant exporte comme l'animateur.
  const other = await browser.newContext();
  const alice = await other.newPage();
  await recordClipboard(alice);
  await alice.goto(invitation);
  await alice.getByLabel('Votre pseudo').fill('alice');
  await alice.getByRole('button', { name: 'Rejoindre' }).click();
  await expect(rows(alice)).toHaveCount(5);

  const csv = await exportFile(alice, 'Tableau CSV');
  expect(csv.suggestedFilename()).toMatch(/^export-[a-z0-9]+-tableau-v1\.csv$/);
  const text = await contentOf(csv);
  expect(text.startsWith('﻿')).toBe(true);
  expect(text.split('\r\n').slice(0, 2)).toEqual([
    '﻿Rang;Identifiant;Titre;Description;BV;TC;RR/OE;JS;CoD;WSJF;À revoir;Motif',
    '1;F-3;Recherche | filtres;;10;8;5;2;23;11,50;;',
  ]);
  expect(text).toContain(
    '2;F-1;Paiement en un clic;"Deux lignes,\navec ; et « guillemets »";8;5;3;4;16;4,00;;',
  );
  expect(text).toContain('\r\n;F-5;Incomplète;;6;;;;;;;\r\n');
  await expect(alice.locator('.export-notice')).toContainText(
    /Fichier téléchargé : export-[a-z0-9]+-tableau-v1\.csv/,
  );

  // Copier pour Confluence : un tableau HTML, avec sa version texte.
  await alice.getByRole('button', { name: 'Exporter' }).click();
  await alice.getByRole('menuitem', { name: 'Copier pour Confluence' }).click();
  await expect(alice.locator('.export-notice')).toContainText('Tableau copié');
  const [copied] = await alice.evaluate(
    () => (window as unknown as { copied: Record<string, string>[] }).copied,
  );
  expect(copied['text/html']).toMatch(
    /^<h2>Priorisation Fonctionnalités : Export [a-z0-9]+ \(\d\d\/\d\d\/\d{4}\)<\/h2>/,
  );
  expect(copied['text/html']).toContain('Format confluence-v1');
  expect(copied['text/html']).toContain('<td>1</td><td>F-3</td><td>Recherche | filtres</td>');
  expect(copied['text/plain']).toContain('1\tF-3\tRecherche | filtres');

  // Wiki markup.
  const wiki = await exportFile(alice, 'Confluence (wiki markup)');
  expect(wiki.suggestedFilename()).toMatch(/^export-[a-z0-9]+-confluence-v1\.txt$/);
  const markup = await contentOf(wiki);
  expect(markup).toContain(
    '||Rang||Identifiant||Titre||Description||BV||TC||RR/OE||JS||CoD||WSJF||',
  );
  expect(markup).toContain('|1|F-3|Recherche \\| filtres| |10|8|5|2|23|11,50| | |');
  expect(markup).toContain('|2|F-1|Paiement en un clic|Deux lignes,\\\\avec ; et « guillemets »|');
  await other.close();
});

test('V12 : le JSON et le CSV tableau se réimportent dans une session vide', async ({ page }) => {
  await createSession(page, 'Origine');
  // Échelle 1 à 20 : l'export JSON la transporte.
  await page.getByRole('button', { name: 'Échelle', exact: true }).click();
  const scale = page.getByRole('dialog', { name: 'Échelle des valeurs' });
  await scale.getByLabel('Borne supérieure').fill('20');
  await scale.getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.board-info-text')).toContainText('Échelle 1 à 20');
  await importFile(page, 'fonctionnalites.csv', Buffer.from(FEATURES, 'utf8'), 5);
  const board = await rowTexts(page);

  const json = await exportFile(page, 'Session complète JSON');
  expect(json.suggestedFilename()).toMatch(/^origine-[a-z0-9]+-session-v1\.json$/);
  const exported = JSON.parse(await contentOf(json)) as { formatVersion: number; rounds: [] };
  expect(exported.formatVersion).toBe(1);
  expect(exported.rounds).toEqual([]);
  const csv = await exportFile(page, 'Tableau CSV');
  const csvContent = Buffer.from(await contentOf(csv), 'utf8');

  // JSON : mêmes fonctionnalités, valeurs, échelle et scores.
  await createSession(page, 'Copie JSON');
  await importFile(page, 'origine-session-v1.json', Buffer.from(JSON.stringify(exported)), 5);
  await expect(page.locator('.board-info-text')).toContainText('Échelle 1 à 20');
  expect(await rowTexts(page)).toEqual(board);

  // CSV tableau, dans une session vide de même échelle : mêmes fonctionnalités et scores.
  await createSession(page, 'Copie CSV');
  await page.getByRole('button', { name: 'Échelle', exact: true }).click();
  await scale.getByLabel('Borne supérieure').fill('20');
  await scale.getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.board-info-text')).toContainText('Échelle 1 à 20');
  await importFile(page, 'origine-tableau-v1.csv', csvContent, 5);
  expect(await rowTexts(page)).toEqual(board);
});
