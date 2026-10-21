import { expect, test, type Browser, type Page } from '@playwright/test';

import { namePattern, uniqueName } from './session-name';

/**
 * Parcours du quickstart qui manquaient contre le vrai webservice (T120) : V13b (nom de session unique), V17 (marque
 * « à revoir », sans la partie tour de vote, qui vient avec US2) et V18 (prioriser par classement).
 */

const FINITIONS = namePattern('Finitions');

const rows = (page: Page) => page.locator('tbody tr');
const rowTexts = async (page: Page) =>
  (await rows(page).allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());

/** Crée une session « Finitions … » avec le pseudo « anim » et arrive sur son tableau. Renvoie le lien d'invitation. */
async function createSession(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByLabel('Nom de la session').fill(uniqueName('Finitions'));
  await page.getByLabel('Votre pseudo').fill('anim');
  await page.getByRole('button', { name: 'Créer la session' }).click();
  await expect(page.getByRole('heading', { name: 'Session créée' })).toBeVisible();
  const [invitation] = await page.locator('code').allInnerTexts();
  await page.getByRole('button', { name: 'Aller à la session' }).click();
  await expect(page.getByRole('heading', { level: 1, name: FINITIONS })).toBeVisible();
  return invitation;
}

async function addFeature(page: Page, id: string, title: string, values: Record<string, string>) {
  await page.getByRole('button', { name: '+ Fonctionnalité' }).click();
  await page.getByRole('textbox', { name: 'Identifiant' }).fill(id);
  await page.getByRole('textbox', { name: 'Titre' }).fill(title);
  for (const [code, value] of Object.entries(values)) {
    await page.getByRole('textbox', { name: code, exact: true }).fill(value);
  }
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.edit-row')).toHaveCount(0);
}

async function openParticipant(browser: Browser, invitation: string): Promise<Page> {
  const alice = await (await browser.newContext()).newPage();
  await alice.goto(invitation);
  await alice.getByLabel('Votre pseudo').fill('alice');
  await alice.getByRole('button', { name: 'Rejoindre' }).click();
  await expect(alice.getByRole('heading', { level: 1, name: FINITIONS })).toBeVisible();
  return alice;
}

/** Les valeurs du classement affiché, dans l'ordre du classement, puis celles des non classées. */
const rankingValues = (page: Page) =>
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

test('V13b : une seconde session du même nom, à la casse près, est refusée', async ({ page }) => {
  const name = uniqueName('PI26T7_TEST');
  await page.goto('/');
  await page.getByLabel('Nom de la session').fill(name);
  await page.getByLabel('Votre pseudo').fill('anim');
  await page.getByRole('button', { name: 'Créer la session' }).click();
  await expect(page.getByRole('heading', { name: 'Session créée' })).toBeVisible();

  await page.goto('/');
  const nameField = page.getByLabel('Nom de la session');
  await nameField.fill(`  ${name.toLowerCase()} `);
  await page.getByLabel('Votre pseudo').fill('anim');
  await page.getByRole('button', { name: 'Créer la session' }).click();
  await expect(
    page.getByText('Une session porte déjà ce nom. Choisissez-en un autre.'),
  ).toBeVisible();
  await expect(nameField).toHaveValue(`  ${name.toLowerCase()} `);
  await expect(page.getByRole('heading', { name: 'Session créée' })).toHaveCount(0);

  const list = page.getByRole('table', { name: 'Liste des sessions' });
  await page.getByLabel('Nom', { exact: true }).fill(name);
  await expect(list.locator('tbody tr')).toHaveCount(1);
});

test('V17 (sans tour de vote) : la marque « à revoir » et son motif apparaissent chez tous, sans changer le calcul', async ({
  browser,
  page,
}) => {
  const invitation = await createSession(page);
  await addFeature(page, 'F-1', 'Paiement en un clic', { BV: '8', TC: '5', 'RR/OE': '3', JS: '4' });
  await addFeature(page, 'F-9', 'Export comptable', { BV: '2', TC: '2', 'RR/OE': '2', JS: '3' });
  const alice = await openParticipant(browser, invitation);
  const before = [
    '1 F-1 Paiement en un clic 8 5 3 4 16 4,00',
    '2 F-9 Export comptable 2 2 2 3 6 2,00',
  ];
  await expect.poll(() => rowTexts(alice)).toEqual(before);

  await page.getByRole('button', { name: 'F-9', exact: true }).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('button', { name: 'Marquer à revoir' }).click();
  await panel
    .getByLabel('Motif (facultatif, 200 caractères au plus)')
    .fill('descriptif à compléter');
  await panel.getByRole('button', { name: 'Marquer', exact: true }).click();
  await expect(panel.locator('.badge.review')).toHaveAttribute('title', 'descriptif à compléter');
  await page.keyboard.press('Escape');

  // Chez Alice, en moins de 2 s : le badge et son motif, sur la même ligne, au même rang et au même WSJF.
  const badge = rows(alice).nth(1).locator('.badge.review');
  await expect(badge).toBeVisible({ timeout: 2_000 });
  await expect(badge).toHaveAttribute('title', 'À revoir : descriptif à compléter');
  await expect
    .poll(() => rowTexts(alice))
    .toEqual([before[0], '2 F-9 à revoir Export comptable 2 2 2 3 6 2,00']);

  // Retirer la marque la fait disparaître chez tous.
  await page.getByRole('button', { name: 'F-9', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer la marque' }).click();
  await expect(rows(alice).nth(1).locator('.badge.review')).toHaveCount(0, { timeout: 2_000 });
});

test('V18 : prioriser par classement, chez tous en moins de 2 s, puis une modification concurrente', async ({
  browser,
  context,
  page,
}) => {
  const invitation = await createSession(page);
  await addFeature(page, 'F-1', 'Paiement en un clic', { BV: '8', TC: '5', 'RR/OE': '3', JS: '4' });
  await addFeature(page, 'F-2', 'Notifications de livraison', {
    BV: '2',
    TC: '2',
    'RR/OE': '2',
    JS: '3',
  });
  await addFeature(page, 'F-3', 'Programme de fidélité', { BV: '6' });
  const alice = await openParticipant(browser, invitation);
  const initial = [
    '1 F-1 Paiement en un clic 8 5 3 4 16 4,00',
    '2 F-2 Notifications de livraison 2 2 2 3 6 2,00',
    '— F-3 Programme de fidélité 6 — — — — non calculé',
  ];
  await expect.poll(() => rowTexts(alice)).toEqual(initial);

  const chooseBvAndJs = async () => {
    await page.getByRole('button', { name: 'Prioriser par classement' }).click();
    await page.getByLabel('TC · Time Criticality').uncheck();
    await page.getByLabel('RR/OE · Risk Reduction / Opportunity Enablement').uncheck();
    await page.getByRole('button', { name: 'Commencer le classement' }).click();
  };

  // Premier passage sans rien toucher : rien n'est envoyé, les valeurs actuelles restent.
  await chooseBvAndJs();
  await page.getByRole('button', { name: 'Critère suivant' }).click();
  await page.getByRole('button', { name: 'Terminer et enregistrer' }).click();
  await expect(page.locator('table.board-table')).toBeVisible();
  await expect.poll(() => rowTexts(alice)).toEqual(initial);

  // BV : F-2 à égalité avec F-3, premier niveau à 5.
  await chooseBvAndJs();
  await rankingValues(page).toEqual(['8', '6', '2']);
  await page.getByRole('button', { name: 'Égalité avec au-dessus : F-2' }).click();
  await page.getByLabel('Valeur du premier niveau (BV)').fill('5');
  await rankingValues(page).toEqual(['5', '4', '4']);
  await page.getByRole('button', { name: 'Critère suivant' }).click();
  // JS : F-3 classée en dernier puis montée en tête, premier niveau à 3, F-2 vidée.
  await page.getByRole('button', { name: 'Classer en dernier : F-3' }).click();
  await page.getByRole('button', { name: 'Monter : F-3' }).click();
  await page.getByRole('button', { name: 'Monter : F-3' }).click();
  await page.getByLabel('Valeur du premier niveau (JS)').fill('3');
  await page.getByLabel('JS de F-2').fill('');
  await rankingValues(page).toEqual(['3', '2', '']);
  await page.getByRole('button', { name: 'Terminer et enregistrer' }).click();

  // Le tableau réapparaît trié par WSJF, chez l'animateur et chez Alice en moins de 2 s.
  const ranked = [
    '1 F-1 Paiement en un clic 5 5 3 2 13 6,50',
    '2 F-3 Programme de fidélité 4 — — 3 4 1,33',
    '— F-2 Notifications de livraison 4 2 2 — — non calculé',
  ];
  await expect(page.locator('table.board-table')).toBeVisible();
  await expect.poll(() => rowTexts(alice), { timeout: 2_000 }).toEqual(ranked);

  // Modification concurrente : un second onglet d'animateur change F-1 pendant un classement.
  await chooseBvAndJs();
  const second = await context.newPage();
  await second.goto(page.url());
  await rows(second).first().getByRole('button', { name: 'Modifier' }).click();
  await second.getByRole('textbox', { name: 'BV', exact: true }).fill('9');
  await second.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(second.locator('.edit-row')).toHaveCount(0);

  await page.getByLabel('Valeur du premier niveau (BV)').fill('7');
  await page.getByRole('button', { name: 'Critère suivant' }).click();
  await page.getByRole('button', { name: 'Terminer et enregistrer' }).click();
  const unsaved = page.locator('.ranking-unsaved');
  await expect(unsaved).toContainText('F-1');
  await expect(page.getByRole('button', { name: 'Enregistrer quand même' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retour au tableau' })).toBeVisible();
});
