import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { SESSION_ID } from '../src/app/testing/fixtures';
import { FakeSession, feature } from './fake-session-socket';

/** Trois fonctionnalités : F-1 (WSJF 4,00), F-4 (2,60) et F-3 incomplète. */
const threeFeatures = () => [
  feature(
    'F-1',
    'Paiement en un clic',
    { bv: 8, tc: 5, rrOe: 3, js: 4 },
    { description: 'Payer en un seul clic.' },
  ),
  feature('F-4', 'Export comptable mensuel', { bv: 5, tc: 6, rrOe: 2, js: 5 }),
  feature('F-3', 'Programme de fidélité', { bv: 6 }),
];

const manyFeatures = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    feature(`F-${i + 1}`, `Fonctionnalité numéro ${i + 1}`, {
      bv: 1 + (i % 9),
      tc: 2,
      rrOe: 3,
      js: 1 + (i % 7),
    }),
  );

async function open(page: Page, fake: FakeSession, facilitator: boolean): Promise<void> {
  await fake.install(page, { facilitator });
  await page.goto(`/s/${SESSION_ID}`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'PI 27 – Epics plateforme' }),
  ).toBeVisible();
}

const ids = async (page: Page) =>
  (await page.locator('tbody tr .fid, tbody tr.edit-row b').allTextContents()).map((id) =>
    id.trim(),
  );

test.describe('animateur sur ordinateur', () => {
  test('le tableau montre les valeurs du serveur, triées par WSJF', async ({ page }) => {
    await open(page, new FakeSession(threeFeatures()), true);
    await expect(page.getByText('Animateur : eric (vous) · Échelle 1 à 10')).toBeVisible();
    expect(await ids(page)).toEqual(['F-1', 'F-4', 'F-3']);
    const first = page.locator('tbody tr').first();
    await expect(first.locator('td').nth(8)).toHaveText('4,00');
    await expect(page.locator('tbody tr').nth(1).locator('td').nth(8)).toHaveText('2,60');
    await expect(page.locator('tbody tr').nth(2).locator('td').nth(8)).toHaveText('non calculé');
  });

  test('ajoute une fonctionnalité avec une seule intention, et le tableau se retrie', async ({
    page,
  }) => {
    const fake = new FakeSession(threeFeatures());
    await open(page, fake, true);
    await page.getByRole('button', { name: '+ Fonctionnalité' }).click();
    await page.getByLabel('Identifiant de la fonctionnalité').fill('F-9');
    await page.getByLabel('Titre', { exact: true }).fill('Recherche globale');
    for (const [label, value] of [
      ['BV', '9'],
      ['TC', '9'],
      ['RR/OE', '9'],
      ['JS', '1'],
    ]) {
      await page.getByLabel(label, { exact: true }).fill(value);
    }
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('tr.edit-row')).toHaveCount(0);
    expect(fake.intents).toHaveLength(1);
    expect(fake.intents[0]).toMatchObject({
      type: 'addFeature',
      externalId: 'F-9',
      title: 'Recherche globale',
    });
    expect(await ids(page)).toEqual(['F-9', 'F-1', 'F-4', 'F-3']);
  });

  test('la ligne en cours de saisie ne bouge pas : le tableau ne se retrie qu’à « Enregistrer »', async ({
    page,
  }) => {
    const fake = new FakeSession(threeFeatures());
    await open(page, fake, true);
    await page.getByRole('button', { name: 'Modifier F-4' }).click();
    await page.getByLabel('BV', { exact: true }).fill('10');
    await page.getByLabel('JS', { exact: true }).fill('1');
    expect(await ids(page)).toEqual(['F-1', 'F-4', 'F-3']);
    expect(fake.intents).toHaveLength(0);
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('tr.edit-row')).toHaveCount(0);
    expect(fake.intents).toHaveLength(1);
    expect(await ids(page)).toEqual(['F-4', 'F-1', 'F-3']);
  });

  test('refuse une valeur hors échelle sans rien envoyer', async ({ page }) => {
    const fake = new FakeSession(threeFeatures());
    await open(page, fake, true);
    await page.getByRole('button', { name: 'Modifier F-1' }).click();
    for (const value of ['0', '11', '2,5']) {
      await page.getByLabel('JS', { exact: true }).fill(value);
      await page.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(page.getByText('Le JS doit être un nombre entier entre 1 et 10.')).toBeVisible();
    }
    expect(fake.intents).toHaveLength(0);
  });

  test('supprime une fonctionnalité après confirmation', async ({ page }) => {
    const fake = new FakeSession(threeFeatures());
    await open(page, fake, true);
    await page.getByRole('button', { name: 'Modifier F-3' }).click();
    await page.getByRole('button', { name: 'Supprimer' }).click();
    await expect(page.getByText('Supprimer F-3 ?')).toBeVisible();
    expect(fake.intents).toHaveLength(0);
    await page.getByRole('button', { name: 'Confirmer la suppression' }).click();
    await expect.poll(() => ids(page)).toEqual(['F-1', 'F-4']);
    expect(fake.intents).toHaveLength(1);
  });

  test('montre la valeur actuelle quand une autre personne a modifié la fonctionnalité', async ({
    page,
  }) => {
    const fake = new FakeSession(threeFeatures());
    await open(page, fake, true);
    await page.getByRole('button', { name: 'Modifier F-1' }).click();
    // Un autre poste change le JS entre-temps : la version de F-1 avance.
    fake.change((features) => {
      features[0].criteria['js'] = 5;
      features[0].version++;
    });
    await page.getByLabel('JS', { exact: true }).fill('3');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(
      page.getByText('Cette fonctionnalité a été modifiée ailleurs entre-temps.'),
    ).toBeVisible();
    await expect(page.getByText('JS vaut maintenant 5 (vous aviez saisi 3).')).toBeVisible();
    await page.getByRole('button', { name: 'Garder les valeurs actuelles' }).click();
    await expect(page.locator('tr.edit-row')).toHaveCount(0);
  });

  test('modifie le titre et le descriptif dans le panneau, visible tout de suite', async ({
    page,
  }) => {
    const fake = new FakeSession(threeFeatures());
    await open(page, fake, true);
    await page.getByRole('button', { name: 'F-1', exact: true }).click();
    await page.getByRole('button', { name: 'Modifier le titre et le descriptif' }).click();
    await page.getByLabel('Titre', { exact: true }).fill('Paiement express');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(
      page.getByText('Modification enregistrée et visible par tous les participants.'),
    ).toBeVisible();
    expect(fake.intents).toHaveLength(1);
    await expect(page.locator('tbody tr').first()).toContainText('Paiement express');
  });

  test('marque une fonctionnalité « à revoir » sans changer le classement', async ({ page }) => {
    const fake = new FakeSession(threeFeatures());
    await open(page, fake, true);
    await page.getByRole('button', { name: 'F-4', exact: true }).click();
    await page.getByLabel('Motif').fill('descriptif à compléter');
    await page.getByRole('button', { name: 'Marquer à revoir' }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('tbody tr').nth(1).locator('.badge.review')).toHaveText('à revoir');
    expect(await ids(page)).toEqual(['F-1', 'F-4', 'F-3']);
  });

  test('affiche le lien d’animation privé, à garder pour soi', async ({ page }) => {
    await open(page, new FakeSession(threeFeatures()), true);
    await page.getByRole('button', { name: "Afficher mon lien d'animation" }).click();
    await expect(page.getByText('À garder pour vous.')).toBeVisible();
    await expect(page.locator('.secret code')).toHaveText(
      new RegExp(`/s/${SESSION_ID}/animer#anim-token$`),
    );
  });
});

test.describe('participant, sans tour en cours', () => {
  test('voit le même tableau, sans aucune action d’animation (FR-014b)', async ({ page }) => {
    await open(page, new FakeSession(threeFeatures()), false);
    await expect(page.getByText('Vous : alice · Animée par eric · Échelle 1 à 10')).toBeVisible();
    await expect(page.getByText('Aucun tour de vote en cours')).toBeVisible();
    expect(await ids(page)).toEqual(['F-1', 'F-4', 'F-3']);
    await expect(page.locator('tbody tr').first().locator('td').nth(8)).toHaveText('4,00');
    await expect(page.getByRole('button', { name: '+ Fonctionnalité' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Modifier/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: "Afficher mon lien d'animation" })).toHaveCount(
      0,
    );
    await expect(page.getByRole('button', { name: 'Exporter' })).toBeDisabled();
  });

  test('voit en direct la modification faite par l’animateur, en moins de 2 secondes (SC-002)', async ({
    page,
  }) => {
    const fake = new FakeSession(threeFeatures());
    await open(page, fake, false);
    fake.change((features) => {
      features[1].criteria['bv'] = 10;
      features[1].criteria['js'] = 1;
      features[1].version++;
    });
    await expect.poll(() => ids(page), { timeout: 2000 }).toEqual(['F-4', 'F-1', 'F-3']);
  });

  test('lit le descriptif d’une fonctionnalité, en lecture seule, et ferme avec Échap', async ({
    page,
  }) => {
    await open(page, new FakeSession(threeFeatures()), false);
    await page.getByRole('button', { name: 'F-1', exact: true }).click();
    const panel = page.getByRole('dialog');
    await expect(panel.getByRole('heading', { name: 'Paiement en un clic' })).toBeVisible();
    await expect(panel.getByText('Payer en un seul clic.')).toBeVisible();
    await expect(panel.getByText('CoD = 8 + 5 + 3 = 16 ; WSJF = 16 / 4 = 4,00')).toBeVisible();
    await expect(
      panel.getByRole('button', { name: 'Modifier le titre et le descriptif' }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  });

  test('consulte la méthode de la session, en lecture seule', async ({ page }) => {
    await open(page, new FakeSession(threeFeatures()), false);
    await page.getByRole('button', { name: 'Voir la méthode complète' }).click();
    const panel = page.getByRole('dialog');
    await expect(panel.getByRole('heading', { name: /WSJF/ })).toBeVisible();
    await expect(panel.getByText('CoD = BV + TC + RR/OE ; WSJF = CoD / JS')).toBeVisible();
    await expect(panel.getByText("Colonne d'import et d'export : RR/OE.")).toBeVisible();
    await expect(panel.locator('input, textarea, select')).toHaveCount(0);
  });

  test('replie l’encadré d’aide et retrouve son état au rechargement', async ({ page }) => {
    await open(page, new FakeSession(threeFeatures()), false);
    await page.getByRole('button', { name: /Replier/ }).click();
    await expect(page.getByText('Valeur apportée')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: /Déplier/ })).toBeVisible();
  });
});

test.describe('mise en page', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('avec 50 fonctionnalités, la page ne défile pas : seule la liste défile (FR-014a)', async ({
    page,
  }) => {
    await open(page, new FakeSession(manyFeatures(50)), true);
    const metrics = await page.evaluate(() => ({
      pageScroll: document.documentElement.scrollHeight - innerHeight,
      list: (() => {
        const wrap = document.querySelector('.table-wrap') as HTMLElement;
        return { scrolls: wrap.scrollHeight > wrap.clientHeight, height: wrap.clientHeight };
      })(),
    }));
    expect(metrics.pageScroll).toBeLessThanOrEqual(0);
    expect(metrics.list.scrolls).toBe(true);
    expect(metrics.list.height).toBeGreaterThan(200);
    // La légende reste visible et l'en-tête reste figé quand la liste défile.
    await page.locator('.table-wrap').evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(page.locator('thead th').first()).toBeInViewport();
    await expect(page.locator('.legend')).toBeInViewport();
    await expect(page.getByText('Fonctionnalité numéro 50')).toBeVisible();
  });

  test('le panneau latéral reste visible pendant que la liste défile', async ({ page }) => {
    await open(page, new FakeSession(manyFeatures(50)), true);
    await page.locator('.table-wrap').evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(page.getByRole('heading', { name: 'Participants (2)' })).toBeInViewport();
    await expect(page.getByRole('heading', { name: 'Comprendre le WSJF' })).toBeInViewport();
  });

  test('les titres longs sont tronqués avec des points de suspension, le titre complet est au survol', async ({
    page,
  }) => {
    const long = 'Un titre vraiment très long '.repeat(8).trim();
    await open(
      page,
      new FakeSession([feature('F-1', long, { bv: 1, tc: 1, rrOe: 1, js: 1 })]),
      true,
    );
    const cell = page.locator('tbody td.title').first();
    await expect(cell).toHaveAttribute('title', long);
    const shape = await cell.evaluate((el) => ({
      truncated: el.scrollWidth > el.clientWidth,
      oneLine: el.getBoundingClientRect().height < 60,
      ellipsis: getComputedStyle(el).textOverflow,
    }));
    expect(shape).toEqual({ truncated: true, oneLine: true, ellipsis: 'ellipsis' });
  });
});

test.describe('téléphone', () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test('lecture seule : cartes à la place du tableau, aucune action de saisie', async ({
    page,
  }) => {
    await open(page, new FakeSession(threeFeatures()), true);
    await expect(page.getByText('Pour voter ou modifier, utilisez un ordinateur')).toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);
    await expect(page.locator('.fcard')).toHaveCount(3);
    await expect(page.locator('.fcard').first()).toContainText('F-1');
    await expect(page.locator('.fcard').first().locator('.wsjf-big')).toHaveText('4,00');
    await expect(page.locator('.fcard').nth(2).locator('.wsjf-big')).toHaveText('non calculé');
    // aucun défilement horizontal de la page
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(0);
    await expect(page.getByRole('button', { name: '+ Fonctionnalité' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Modifier/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: "Afficher mon lien d'animation" })).toHaveCount(
      0,
    );
  });

  test('le panneau de détail occupe tout l’écran et se lit', async ({ page }) => {
    await open(page, new FakeSession(threeFeatures()), false);
    await page.locator('.fcard .fid').first().click();
    const box = await page.getByRole('dialog').boundingBox();
    expect(box?.width).toBeCloseTo(390, 0);
    await expect(page.getByRole('dialog').getByText('Payer en un seul clic.')).toBeVisible();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Modifier le titre et le descriptif' }),
    ).toHaveCount(0);
  });
});

test.describe('accessibilité (axe-core)', () => {
  const scan = async (page: Page) =>
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations;

  test('tableau de l’animateur', async ({ page }) => {
    await open(page, new FakeSession(threeFeatures()), true);
    expect(await scan(page)).toEqual([]);
  });

  test('ligne d’édition ouverte', async ({ page }) => {
    await open(page, new FakeSession(threeFeatures()), true);
    await page.getByRole('button', { name: 'Modifier F-1' }).click();
    expect(await scan(page)).toEqual([]);
  });

  test('tableau du participant', async ({ page }) => {
    await open(page, new FakeSession(threeFeatures()), false);
    expect(await scan(page)).toEqual([]);
  });

  test('panneau de détail ouvert', async ({ page }) => {
    await open(page, new FakeSession(threeFeatures()), true);
    await page.getByRole('button', { name: 'F-1', exact: true }).click();
    expect(await scan(page)).toEqual([]);
  });

  test('panneau de la méthode ouvert', async ({ page }) => {
    await open(page, new FakeSession(threeFeatures()), false);
    await page.getByRole('button', { name: 'Voir la méthode complète' }).click();
    expect(await scan(page)).toEqual([]);
  });

  test('sur téléphone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await open(page, new FakeSession(threeFeatures()), false);
    expect(await scan(page)).toEqual([]);
  });

  test('au clavier : Tab atteint l’identifiant, Entrée ouvre le détail, Échap le ferme', async ({
    page,
  }) => {
    await open(page, new FakeSession(threeFeatures()), false);
    await page.locator('tbody .fid').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fermer' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('tbody .fid').first()).toBeFocused();
  });
});
