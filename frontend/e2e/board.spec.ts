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

/** Ouvre la session avec un faux socket ; `animate` range aussi le jeton d'animation. */
async function open(page: Page, animate: boolean): Promise<void> {
  await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'UP' } }));
  await installFakeSocket(page);
  await storeTokens(page, { animate });
  await page.goto(`/s/${SESSION_ID}`);
}

const rows = (page: Page) => page.locator('tbody tr');
const rowTexts = async (page: Page) =>
  (await rows(page).allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());

test.describe('tableau de priorisation', () => {
  test('les colonnes et les lignes suivent la définition de la méthode et l’ordre du serveur', async ({
    page,
  }) => {
    await open(page, false);
    await push(page, sessionState([F1, F2, F3], { animate: false }));

    await expect(page.locator('thead th')).toHaveText([
      'Rang',
      'Identifiant',
      'Titre',
      'BV',
      'TC',
      'RR/OE',
      'JS',
      'CoD',
      'WSJF',
    ]);
    expect(await rowTexts(page)).toEqual([
      '1 F-1 Paiement en un clic 8 5 3 4 16 4,00',
      '2 F-2 Notifications de livraison 2 2 2 3 6 2,00',
      '— F-3 Programme de fidélité 6 — — — — non calculé',
    ]);
  });

  test('un participant hors tour voit tout le tableau et aucune action d’animation (FR-014b)', async ({
    page,
  }) => {
    await open(page, false);
    await push(page, sessionState([F1, F2], { animate: false }));

    await expect(page.getByText('Aucun tour de vote en cours')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Modifier', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '+ Fonctionnalité' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Liens' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Importer', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Échelle', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Exporter' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Tours révélés' })).toBeDisabled();
    await expect(page.getByRole('cell', { name: '4,00' })).toBeVisible();
  });

  test('une modification d’un autre poste s’affiche aussitôt, sans rechargement', async ({
    page,
  }) => {
    await open(page, false);
    await push(page, sessionState([F1, F2], { animate: false }));
    await expect(rows(page).first()).toContainText('F-1');

    const updatedF1 = {
      ...F1,
      version: 2,
      criteria: { bv: 8, tc: 5, rrOe: 3, js: 10 },
      score: {
        ...F1.score,
        rank: 2,
        computed: {
          cod: { numerator: 16, denominator: 1, display: '16' },
          wsjf: { numerator: 8, denominator: 5, display: '1,60' },
        },
      },
    };
    const promotedF2 = { ...F2, score: { ...F2.score, rank: 1 } };
    await push(page, sessionState([promotedF2, updatedF1], { animate: false, version: 2 }));

    await expect(rows(page).first()).toContainText('F-2');
    await expect(rows(page).nth(1)).toContainText('1,60');
  });

  test('sur téléphone : des cartes en lecture seule et le bandeau « utilisez un ordinateur »', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await open(page, true);
    await push(page, sessionState([F1, F2], { animate: true }));

    await expect(page.getByText('Pour voter ou modifier, utilisez un ordinateur')).toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);
    await expect(page.locator('.fcard')).toHaveCount(2);
    await expect(page.locator('.fcard').first()).toContainText('4,00');
    await expect(page.getByRole('button', { name: 'Modifier', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '+ Fonctionnalité' })).toHaveCount(0);
  });

  test('l’animateur modifie une ligne : le tableau ne se retrie qu’à « Enregistrer »', async ({
    page,
  }) => {
    await open(page, true);
    await push(page, sessionState([F1, F2], { animate: true }));

    await rows(page).first().getByRole('button', { name: 'Modifier' }).click();
    await page.getByRole('textbox', { name: 'JS' }).fill('10');
    // Rien n’est envoyé ni retrié pendant la saisie.
    expect(await sentOfType(page, 'updateFeature')).toHaveLength(0);
    await expect(rows(page).first()).toContainText('F-1');

    await page.getByRole('button', { name: 'Enregistrer' }).click();
    const updates = await sentOfType(page, 'updateFeature');
    expect(updates).toEqual([
      { type: 'updateFeature', featureId: F1.id, version: 1, criteria: { js: 10 } },
    ]);
    // Pendant qu’on attend le serveur, la ligne reste en place.
    await expect(rows(page).first()).toContainText('F-1');

    const updatedF1 = {
      ...F1,
      version: 2,
      criteria: { bv: 8, tc: 5, rrOe: 3, js: 10 },
      score: {
        ...F1.score,
        rank: 2,
        computed: {
          cod: { numerator: 16, denominator: 1, display: '16' },
          wsjf: { numerator: 8, denominator: 5, display: '1,60' },
        },
      },
    };
    await push(
      page,
      sessionState([{ ...F2, score: { ...F2.score, rank: 1 } }, updatedF1], {
        animate: true,
        version: 2,
      }),
    );

    await expect(rows(page).first()).toContainText('F-2');
    await expect(rows(page).nth(1)).toContainText('1,60');
    await expect(page.locator('.edit-row')).toHaveCount(0);
  });

  test('les saisies invalides sont refusées avec un message qui dit quoi corriger', async ({
    page,
  }) => {
    await open(page, true);
    await push(page, sessionState([F1], { animate: true }));
    await rows(page).first().getByRole('button', { name: 'Modifier' }).click();

    for (const bad of ['0', '11', '2,5']) {
      await page.getByRole('textbox', { name: 'JS' }).fill(bad);
      await page.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(page.getByRole('alert')).toContainText('JS doit être un entier entre 1 et 10');
    }
    expect(await sentOfType(page, 'updateFeature')).toHaveLength(0);
  });

  test('« + Fonctionnalité » envoie un seul addFeature', async ({ page }) => {
    await open(page, true);
    await push(page, sessionState([], { animate: true }));

    await page.getByRole('button', { name: '+ Fonctionnalité' }).click();
    await page.getByRole('textbox', { name: 'Identifiant' }).fill('F-1');
    await page.getByRole('textbox', { name: 'Titre' }).fill('Paiement en un clic');
    await page.getByRole('textbox', { name: 'BV' }).fill('8');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    expect(await sentOfType(page, 'addFeature')).toEqual([
      { type: 'addFeature', externalId: 'F-1', title: 'Paiement en un clic', criteria: { bv: 8 } },
    ]);
  });

  test('1280 × 720 avec 50 fonctionnalités : la page ne défile pas, seule la liste défile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, true);
    await push(page, sessionState(manyFeatures(50), { animate: true }));
    await expect(rows(page)).toHaveCount(50);

    const { page: pageFits, list } = await page.evaluate(() => {
      const wrap = document.querySelector('.table-wrap') as HTMLElement;
      return {
        page: document.documentElement.scrollHeight <= window.innerHeight,
        list: wrap.scrollHeight > wrap.clientHeight,
      };
    });
    expect(pageFits).toBe(true);
    expect(list).toBe(true);
    // L’en-tête reste visible quand la liste défile.
    await page.locator('.table-wrap').evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(page.locator('thead th').first()).toBeInViewport();
  });

  for (const animate of [true, false]) {
    test(`fenêtre de 1280 × 560 : 15 fonctionnalités visibles sans défilement (${animate ? 'animateur' : 'participant'})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 560 });
      await open(page, animate);
      await push(page, sessionState(manyFeatures(15), { animate }));
      await expect(rows(page)).toHaveCount(15);
      for (const row of await rows(page).all()) await expect(row).toBeInViewport({ ratio: 1 });
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
      ).toBe(true);
    });
  }

  test('1280 × 720 : la ligne en édition tient dans le tableau, sans défilement horizontal', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, true);
    await push(page, sessionState(manyFeatures(30), { animate: true }));
    await rows(page).nth(25).getByRole('button', { name: 'Modifier' }).click();

    await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Supprimer' })).toBeInViewport();
    await expect(page.getByRole('textbox', { name: 'Titre' })).toBeFocused();
    const overflows = await page
      .locator('.table-wrap')
      .evaluate((wrap) => wrap.scrollWidth > wrap.clientWidth);
    expect(overflows).toBe(false);
  });

  test('une ligne ouverte en partie cachée se place sous l’en-tête figé, pas derrière', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, true);
    await push(page, sessionState(manyFeatures(30), { animate: true }));
    const target = rows(page).nth(12);
    // La ligne passe à moitié sous l'en-tête figé, puis on l'ouvre.
    await page.locator('.table-wrap').evaluate(
      (wrap, top) => {
        wrap.scrollTop = top;
      },
      await target.evaluate((row) => (row as HTMLElement).offsetTop - 10),
    );
    await target.getByRole('button', { name: 'Modifier' }).dispatchEvent('click');

    await expect(page.getByRole('textbox', { name: 'Titre' })).toBeFocused();
    await expect
      .poll(async () => {
        const header = await page.locator('thead th').first().boundingBox();
        const row = await page.locator('.edit-row').boundingBox();
        return row!.y >= header!.y + header!.height - 1;
      })
      .toBe(true);
  });

  test('l’icône ⓘ de l’en-tête WSJF donne la formule et la règle de tri', async ({ page }) => {
    await open(page, false);
    await push(page, sessionState([F1, F2, F3], { animate: false }));

    await page.getByRole('button', { name: /^Formule et règle de tri/ }).hover();
    const tip = page.getByRole('tooltip');
    await expect(tip).toContainText('CoD = BV + TC + RR/OE ; WSJF = CoD / JS');
    await expect(tip).toContainText('Tri : WSJF décroissant');
    await expect(tip).toContainText('fin de tableau');
  });

  test('un titre long tient sur une ligne et s’affiche en entier au survol', async ({ page }) => {
    await open(page, false);
    await push(page, sessionState(manyFeatures(1), { animate: false }));
    const full =
      'Fonctionnalité numéro 1 avec un titre assez long pour être tronqué dans la colonne du tableau';
    const title = page.locator('td.title').first();
    await expect(title).toHaveText(full);
    await expect(title).toHaveAttribute('title', full);
    const { lineHeight, height } = await title.evaluate((cell) => ({
      lineHeight: parseFloat(getComputedStyle(cell).lineHeight),
      height: cell.clientHeight,
    }));
    expect(height).toBeLessThan(lineHeight * 2);
  });

  test('le panneau de détail s’ouvre au clic sur l’identifiant et se ferme par Échap', async ({
    page,
  }) => {
    await open(page, false);
    await push(page, sessionState([F1], { animate: false }));

    await page.getByRole('button', { name: 'F-1' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Permettre le paiement sans ressaisir la carte.');
    await expect(dialog).toContainText('CoD = 8 + 5 + 3 = 16 ; WSJF = 16 / 4 = 4,00');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('l’aide : la définition d’un sigle au survol, « Comprendre le WSJF » s’ouvre dans un panneau', async ({
    page,
  }) => {
    await open(page, false);
    await push(page, sessionState([F1], { animate: false }));

    await page.locator('thead').getByRole('button', { name: /^BV,/ }).hover();
    await expect(page.getByRole('tooltip')).toContainText(
      'Valeur apportée aux utilisateurs ou au business.',
    );

    const glossary = page.locator('app-method-glossary');
    await expect(glossary).toHaveCount(0);
    await page.getByRole('button', { name: 'Comprendre le WSJF' }).click();
    await expect(glossary.getByRole('dialog', { name: 'Comprendre le WSJF' })).toBeVisible();
    await expect(glossary.getByRole('term').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(glossary).toHaveCount(0);
  });

  test('accessibilité (axe-core) : tableau animateur, tableau participant, panneau de détail', async ({
    page,
  }) => {
    await open(page, true);
    await push(page, sessionState([F1, F2, F3], { animate: true }));
    await expect(rows(page)).toHaveCount(3);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await rows(page).first().getByRole('button', { name: 'Modifier' }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Annuler' }).click();

    await page.getByRole('button', { name: 'F-1' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
