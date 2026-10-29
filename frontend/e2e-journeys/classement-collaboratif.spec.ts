import { expect, test, type Browser, type Page } from '@playwright/test';

import { namePattern, uniqueName } from './session-name';

/**
 * V19, classement collaboratif (FR-015b, FR-015c), contre le vrai webservice : un animateur classe, deux participants
 * suivent son classement en direct et donnent leur avis ; rien n'est enregistré avant « Terminer ».
 */

const CLASSEMENT = namePattern('Classement');

async function createSession(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByLabel('Nom de la session').fill(uniqueName('Classement'));
  await page.getByLabel('Votre pseudo').fill('anim');
  await page.getByRole('button', { name: 'Créer la session' }).click();
  await expect(page.getByRole('heading', { name: 'Session créée' })).toBeVisible();
  const [invitation] = await page.locator('code').allInnerTexts();
  await page.getByRole('button', { name: 'Aller à la session' }).click();
  await expect(page.getByRole('heading', { level: 1, name: CLASSEMENT })).toBeVisible();
  return invitation;
}

async function addFeature(page: Page, id: string, title: string, bv: string) {
  await page.getByRole('button', { name: '+ Fonctionnalité' }).click();
  await page.getByRole('textbox', { name: 'Identifiant' }).fill(id);
  await page.getByRole('textbox', { name: 'Titre' }).fill(title);
  await page.getByRole('textbox', { name: 'BV', exact: true }).fill(bv);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.edit-row')).toHaveCount(0);
}

async function join(browser: Browser, invitation: string, pseudo: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(invitation);
  await page.getByLabel('Votre pseudo').fill(pseudo);
  await page.getByRole('button', { name: 'Rejoindre' }).click();
  await expect(page.getByRole('heading', { level: 1, name: CLASSEMENT })).toBeVisible();
  return page;
}

/** Les identifiants du classement suivi, du premier niveau au dernier. */
const followedOrder = (page: Page) =>
  expect.poll(() => page.locator('.rank-ranked .rank-item .fid-text').allInnerTexts());

test('V19 : les participants suivent le classement en direct et donnent leur avis', async ({
  page,
  browser,
}) => {
  const invitation = await createSession(page);
  await addFeature(page, 'F-1', 'Paiement en un clic', '8');
  await addFeature(page, 'F-2', 'Notifications de livraison', '5');
  await addFeature(page, 'F-3', 'Programme de fidélité', '2');
  const alice = await join(browser, invitation, 'alice');
  const bob = await join(browser, invitation, 'bob');

  // L'animateur commence le classement de BV : les participants le suivent, à la place du tableau.
  await page.getByRole('button', { name: 'Prioriser par classement' }).click();
  await page.getByLabel('TC · Time Criticality').uncheck();
  await page.getByLabel('RR/OE · Risk Reduction / Opportunity Enablement').uncheck();
  await page.getByLabel('JS · Job Size').uncheck();
  await page.getByRole('button', { name: 'Commencer le classement' }).click();
  for (const participant of [alice, bob]) {
    await expect(participant.getByRole('heading', { name: 'Classement en direct' })).toBeVisible({
      timeout: 2_000,
    });
    await expect(participant.getByText('anim classe BV · Business Value')).toBeVisible();
    await followedOrder(participant).toEqual(['F-1', 'F-2', 'F-3']);
  }

  // Chaque déplacement arrive chez tous en moins de 2 s (SC-002).
  await page.getByRole('button', { name: 'Monter : F-3' }).click();
  await followedOrder(alice).toEqual(['F-1', 'F-3', 'F-2']);
  await followedOrder(bob).toEqual(['F-1', 'F-3', 'F-2']);

  // alice monterait F-2 et l'explique ; bob est d'accord avec F-1, sans commentaire.
  await alice.getByRole('button', { name: 'Je monterais : F-2' }).click();
  await alice
    .getByLabel('Un commentaire ? (facultatif, 140 caractères au plus)')
    .fill('Le transporteur est prêt en mars.');
  await alice.getByRole('button', { name: 'Envoyer' }).click();
  await bob.getByRole('button', { name: 'D’accord : F-1' }).click();
  await bob.getByRole('button', { name: 'Sans commentaire' }).click();

  const panel = page.locator('app-opinions-panel');
  await expect(panel).toContainText('Le transporteur est prêt en mars.');
  await expect(
    page.locator('.rank-item', { hasText: 'F-1' }).locator('.opinion-counts'),
  ).toContainText('✓ 1');

  // L'animateur met F-2 en discussion : elle est mise en avant chez tous, avec ses avis.
  await panel.getByRole('button', { name: 'Mettre en discussion' }).click();
  await expect(bob.locator('.opinion-card.spotlight')).toContainText('F-2');
  await expect(bob.locator('.opinion-card.spotlight')).toContainText('alice');

  // « Annuler » : tout le monde revient au tableau, aucune valeur n'a changé.
  await page.getByRole('button', { name: 'Annuler' }).click();
  for (const participant of [alice, bob]) {
    await expect(participant.getByText('Le classement a été annulé')).toBeVisible();
    await expect(participant.locator('tbody tr').first()).toContainText('F-1');
  }
  await expect(page.locator('tbody tr', { hasText: 'F-3' })).toContainText('2');
});

test('V19 : le classement s’arrête chez les participants quand l’animateur part', async ({
  page,
  browser,
}) => {
  const invitation = await createSession(page);
  await addFeature(page, 'F-1', 'Paiement en un clic', '8');
  const alice = await join(browser, invitation, 'alice');

  await page.getByRole('button', { name: 'Prioriser par classement' }).click();
  await page.getByRole('button', { name: 'Commencer le classement' }).click();
  await expect(alice.getByRole('heading', { name: 'Classement en direct' })).toBeVisible();

  await page.close();

  await expect(alice.getByText('L’animateur s’est déconnecté')).toBeVisible();
  await expect(alice.locator('table.board-table')).toBeVisible();
});
