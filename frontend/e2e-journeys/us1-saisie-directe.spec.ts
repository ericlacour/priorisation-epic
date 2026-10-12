import { expect, test } from '@playwright/test';

import { addFeature, createSession, ids, wsjfOf } from './helpers';

/**
 * US1 contre le vrai webservice (quickstart V1, V1a, V2, V3, V14, V16) : création d'une session, saisie directe
 * des valeurs, recalcul, validation, concurrence entre deux onglets d'animateur et propagation vers un second
 * navigateur. Aucune donnée n'est préparée en base : tout passe par l'interface.
 */

test('V1a : le choix de méthode propose WSJF par défaut et son détail', async ({ page }) => {
  await page.goto('/');
  const select = page.getByLabel('Méthode de priorisation');
  await expect(select.locator('option')).toHaveCount(1);
  await expect(select).toContainText('WSJF (version 1)');
  await page.getByRole('button', { name: 'Voir le détail de la méthode' }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toContainText('CoD = BV + TC + RR/OE ; WSJF = CoD / JS');
  await expect(panel.getByRole('button', { name: /Modifier|Enregistrer/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('V1, V2, V3 : saisie directe, recalcul sans rechargement et validation', async ({ page }) => {
  await createSession(page, 'Démo V1', 'anim');
  await addFeature(page, 'F-1', 'Paiement en un clic', ['8', '5', '3', '4']);
  await addFeature(page, 'F-2', 'Export comptable', ['2', '2', '2', '3']);

  expect(await ids(page)).toEqual(['F-1', 'F-2']);
  await expect(wsjfOf(page, 0)).toHaveText('4,00');
  await expect(wsjfOf(page, 1)).toHaveText('2,00');
  await page.getByRole('button', { name: 'F-1', exact: true }).click();
  await expect(page.getByText('CoD = 8 + 5 + 3 = 16 ; WSJF = 16 / 4 = 4,00')).toBeVisible();
  await page.getByRole('button', { name: 'Fermer' }).click();

  // V3 : une valeur hors échelle ou non entière est refusée avant tout envoi.
  await page.getByRole('button', { name: 'Modifier F-1' }).click();
  for (const value of ['0', '11', '2,5']) {
    await page.getByLabel('JS', { exact: true }).fill(value);
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Le JS doit être un nombre entier entre 1 et 10.')).toBeVisible();
  }

  // V2 : JS passe à 10, F-1 vaut 1,60 et F-2 passe en tête.
  await page.getByLabel('JS', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('tr.edit-row')).toHaveCount(0);
  await expect.poll(() => ids(page)).toEqual(['F-2', 'F-1']);
  await expect(wsjfOf(page, 1)).toHaveText('1,60');

  // La session reprend après rechargement : l'état vient du serveur.
  await page.reload();
  await expect.poll(() => ids(page)).toEqual(['F-2', 'F-1']);
});

test('V16, SC-002 : le titre modifié apparaît vite chez un second participant', async ({
  page,
  browser,
}) => {
  const invitation = await createSession(page, 'Démo V16', 'anim');
  await addFeature(page, 'F-1', 'Titre initial', ['8', '5', '3', '4']);

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(invitation);
  await guest.getByLabel('Votre pseudo').fill('bob');
  await guest.getByRole('button', { name: 'Rejoindre' }).click();
  await expect(guest.getByText('Titre initial')).toBeVisible();
  // L'animateur voit le second participant en ligne.
  await expect(page.getByText('bob').first()).toBeVisible();
  await expect(guest.getByRole('button', { name: '+ Fonctionnalité' })).toHaveCount(0);

  await page.getByRole('button', { name: 'F-1', exact: true }).click();
  await page.getByRole('button', { name: 'Modifier le titre et le descriptif' }).click();
  await page.getByLabel('Titre', { exact: true }).fill('Titre modifié');
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(guest.getByText('Titre initial')).toBeVisible();

  await page.getByRole('button', { name: 'Modifier le titre et le descriptif' }).click();
  await page.getByLabel('Titre', { exact: true }).fill('Titre modifié');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(guest.getByText('Titre modifié')).toBeVisible({ timeout: 2_000 });
  await guestContext.close();
});

test('V14 : deux onglets d’animateur, le second voit la valeur actuelle avant de confirmer', async ({
  page,
  context,
}) => {
  await createSession(page, 'Démo V14', 'anim');
  await addFeature(page, 'F-1', 'Paiement', ['8', '5', '3', '4']);
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(other.getByRole('button', { name: 'Modifier F-1' })).toBeVisible();

  await page.getByRole('button', { name: 'Modifier F-1' }).click();
  await other.getByRole('button', { name: 'Modifier F-1' }).click();
  await other.getByLabel('BV', { exact: true }).fill('9');
  await other.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(other.locator('tr.edit-row')).toHaveCount(0);

  await page.getByLabel('BV', { exact: true }).fill('7');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('BV vaut maintenant 9 (vous aviez saisi 7).')).toBeVisible();
  await page.getByRole('button', { name: 'Remplacer par ma saisie' }).click();
  await expect(page.locator('tr.edit-row')).toHaveCount(0);
  await expect(page.locator('tbody tr').first().locator('td').nth(3)).toHaveText('7');
});

test('V16 : définition au survol, encadré d’aide repliable qui garde son état', async ({
  page,
}) => {
  await createSession(page, 'Démo aide', 'anim');
  await addFeature(page, 'F-1', 'Paiement', ['8', '5', '3', '4']);

  await page.locator('thead').getByRole('button', { name: /^BV/ }).hover();
  await expect(page.locator('.term-tip')).toContainText('Business Value');

  await page.getByRole('button', { name: /Replier/ }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: /Déplier/ })).toBeVisible();
});
