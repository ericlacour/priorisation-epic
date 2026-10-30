import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { namePattern, uniqueName } from './session-name';

/**
 * US1 : prioriser en saisie directe, contre le vrai webservice (quickstart V1, V1a, V2, V3, V14, V16).
 * L'animateur crée la session et saisit ses fonctionnalités dans un premier navigateur ; un participant, dans un
 * second navigateur, voit le même tableau se mettre à jour en direct.
 */

/** Le nom de la session de chaque parcours : « Démo » suivi d'un suffixe propre au parcours. */
const DEMO = namePattern('Démo');

const rows = (page: Page) => page.locator('tbody tr');
const rowTexts = async (page: Page) =>
  (await rows(page).allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());

/** Crée une session « Démo … » avec le pseudo « anim » et arrive sur son tableau. Renvoie le lien d'invitation. */
async function createSession(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByLabel('Nom de la session').fill(uniqueName('Démo'));
  await page.getByLabel('Votre pseudo').fill('anim');
  await page.getByRole('button', { name: 'Créer la session' }).click();

  await expect(page.getByRole('heading', { name: 'Session créée' })).toBeVisible();
  const [invitation, animation] = await page.locator('code').allInnerTexts();
  expect(invitation).toMatch(/\/s\/[A-Za-z0-9_-]{22}$/);
  expect(animation).toMatch(/\/s\/[A-Za-z0-9_-]{22}\/animer#.+/);
  await expect(page.getByText('À garder pour vous.')).toBeVisible();

  await page.getByRole('button', { name: 'Aller à la session' }).click();
  await expect(page.getByRole('heading', { level: 1, name: DEMO })).toBeVisible();
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

async function openParticipant(context: BrowserContext, invitation: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(invitation);
  await page.getByLabel('Votre pseudo').fill('alice');
  await page.getByRole('button', { name: 'Rejoindre' }).click();
  await expect(page.getByRole('heading', { level: 1, name: DEMO })).toBeVisible();
  return page;
}

test('V1, V1a, V2, V3 : saisie directe, méthode, recalcul et validation', async ({ page }) => {
  // V1a : le détail de la méthode, depuis la création.
  await page.goto('/');
  await expect(page.locator('#create-method option')).toHaveCount(1);
  await expect(page.locator('#create-method option')).toContainText('WSJF');
  await page.getByRole('button', { name: 'Voir le détail de la méthode' }).click();
  const methodPanel = page.getByRole('dialog');
  await expect(methodPanel).toContainText(
    'CoD = BV + TC + RR/OE (un critère sans valeur compte 0) ; WSJF = CoD / JS',
  );
  await expect(methodPanel).toContainText('Risk Reduction / Opportunity Enablement');
  await expect(methodPanel.getByRole('button', { name: /Enregistrer|Modifier/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(methodPanel).toHaveCount(0);

  await createSession(page);
  await expect(page.getByText('Ajoutez une première fonctionnalité')).toBeVisible();

  // V1 : F-1 (8, 5, 3, 4) et F-2 (2, 2, 2, 3).
  await addFeature(page, 'F-1', 'Paiement en un clic', { BV: '8', TC: '5', 'RR/OE': '3', JS: '4' });
  await addFeature(page, 'F-2', 'Notifications de livraison', {
    BV: '2',
    TC: '2',
    'RR/OE': '2',
    JS: '3',
  });
  await expect
    .poll(() => rowTexts(page))
    .toEqual([
      '1 F-1 Paiement en un clic 8 5 3 4 16 4,00 Modifier',
      '2 F-2 Notifications de livraison 2 2 2 3 6 2,00 Modifier',
    ]);
  await page.getByRole('button', { name: 'F-1', exact: true }).click();
  // Le panneau de détail ne montre que le descriptif : ni valeurs, ni calcul.
  await expect(page.getByRole('dialog')).toContainText('Descriptif');
  await expect(page.getByRole('dialog')).not.toContainText('Détail du calcul');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // V1a : « Voir la méthode complète » depuis le panneau « Comprendre le WSJF ».
  await page.getByRole('button', { name: 'Comprendre le WSJF' }).click();
  await page.getByRole('button', { name: 'Voir la méthode complète' }).click();
  await expect(page.getByRole('dialog')).toContainText('Entiers de 1 à 10');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // V3 : JS = 0, puis 11, puis 2,5 sont refusés.
  await rows(page).first().getByRole('button', { name: 'Modifier' }).click();
  for (const bad of ['0', '11', '2,5']) {
    await page.getByRole('textbox', { name: 'JS', exact: true }).fill(bad);
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('alert')).toContainText('entier entre 1 et 10');
  }

  // V2 : JS de F-1 à 10, F-1 passe à 1,60 et F-2 passe en tête, sans rechargement.
  await page.getByRole('textbox', { name: 'JS', exact: true }).fill('10');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect
    .poll(() => rowTexts(page))
    .toEqual([
      '1 F-2 Notifications de livraison 2 2 2 3 6 2,00 Modifier',
      '2 F-1 Paiement en un clic 8 5 3 10 16 1,60 Modifier',
    ]);

  // FR-012 (WSJF version 2) : le JS et un seul critère du CoD suffisent ; sans JS, « non calculé ».
  await addFeature(page, 'F-3', 'Export comptable', { BV: '9', JS: '3' });
  await addFeature(page, 'F-4', 'Mode hors ligne', { BV: '5' });
  await expect
    .poll(() => rowTexts(page))
    .toEqual([
      '1 F-3 Export comptable 9 — — 3 9 3,00 Modifier',
      '2 F-2 Notifications de livraison 2 2 2 3 6 2,00 Modifier',
      '3 F-1 Paiement en un clic 8 5 3 10 16 1,60 Modifier',
      '— F-4 Mode hors ligne 5 — — — — non calculé Modifier',
    ]);
  await page.getByRole('button', { name: 'F-3', exact: true }).click();
  // Le panneau de détail ne montre que le descriptif, sans le calcul.
  await expect(page.getByRole('dialog')).toContainText('Export comptable');
  await expect(page.getByRole('dialog')).not.toContainText('CoD =');
  await page.keyboard.press('Escape');
});

test('V4 (partie US1), SC-002 : un participant voit le tableau en direct, sans action d’animation', async ({
  browser,
  page,
}) => {
  const invitation = await createSession(page);
  await addFeature(page, 'F-1', 'Paiement en un clic', { BV: '8', TC: '5', 'RR/OE': '3', JS: '4' });

  const alice = await openParticipant(await browser.newContext(), invitation);
  await expect(alice.locator('.action-bar')).toHaveCount(0);
  await expect(alice.getByRole('button', { name: 'Modifier', exact: true })).toHaveCount(0);
  await expect(alice.getByRole('button', { name: '+ Fonctionnalité' })).toHaveCount(0);
  await expect.poll(() => rowTexts(alice)).toEqual(['1 F-1 Paiement en un clic 8 5 3 4 16 4,00']);
  // Les deux sont en ligne, chez tous (la liste s'ouvre à la demande).
  await alice.getByRole('button', { name: /^Participants/ }).click();
  await page.getByRole('button', { name: /^Participants/ }).click();
  await expect(alice.locator('.plist li .dot.on')).toHaveCount(2);
  await expect(page.locator('.plist li .dot.on')).toHaveCount(2);

  // Une modification de l'animateur s'affiche chez Alice en moins de 2 s (SC-002).
  await rows(page).first().getByRole('button', { name: 'Modifier' }).click();
  await page.getByRole('textbox', { name: 'JS', exact: true }).fill('10');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(alice.getByRole('cell', { name: '1,60' })).toBeVisible({ timeout: 2_000 });
});

test('V14 : deux onglets d’animateur modifient la même valeur, le second voit la valeur actuelle avant de confirmer', async ({
  page,
  context,
}) => {
  await createSession(page);
  await addFeature(page, 'F-1', 'Paiement en un clic', { BV: '8', TC: '5', 'RR/OE': '3', JS: '4' });
  const second = await context.newPage();
  await second.goto(page.url());
  await expect(second.getByRole('heading', { level: 1, name: DEMO })).toBeVisible();
  await expect(second.getByRole('button', { name: 'Modifier', exact: true })).toBeVisible();

  // Les deux onglets ouvrent la ligne avant que l'un des deux n'enregistre.
  await rows(page).first().getByRole('button', { name: 'Modifier' }).click();
  await rows(second).first().getByRole('button', { name: 'Modifier' }).click();
  await page.getByRole('textbox', { name: 'BV', exact: true }).fill('9');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect
    .poll(() => rowTexts(page))
    .toEqual(['1 F-1 Paiement en un clic 9 5 3 4 17 4,25 Modifier']);

  await second.getByRole('textbox', { name: 'BV', exact: true }).fill('7');
  await second.getByRole('button', { name: 'Enregistrer' }).click();
  const conflict = second.locator('.toast');
  await expect(conflict).toContainText('F-1 a été modifiée entre-temps');
  await expect(conflict).toContainText('BV 9');

  // Garder les valeurs actuelles : rien n'est écrasé.
  await second.getByRole('button', { name: 'Garder les valeurs actuelles' }).click();
  await expect
    .poll(() => rowTexts(second))
    .toEqual(['1 F-1 Paiement en un clic 9 5 3 4 17 4,25 Modifier']);
});

test('V16 : définitions au survol, panneau « Comprendre le WSJF », descriptif et titre modifié visible ailleurs', async ({
  browser,
  page,
}) => {
  const invitation = await createSession(page);
  await addFeature(page, 'F-1', 'Paiement en un clic', { BV: '8', TC: '5', 'RR/OE': '3', JS: '4' });
  const alice = await openParticipant(await browser.newContext(), invitation);
  await expect(alice.getByRole('cell', { name: 'Paiement en un clic' })).toBeVisible();

  // Définition de BV au survol.
  await page.locator('thead').getByRole('button', { name: /^BV,/ }).hover();
  await expect(page.getByRole('tooltip')).toContainText(
    'Valeur apportée aux utilisateurs ou au business.',
  );

  // « Comprendre le WSJF » ouvre un panneau avec toutes les définitions.
  const glossary = page.locator('app-method-glossary');
  await page.getByRole('button', { name: 'Comprendre le WSJF' }).click();
  await expect(glossary.getByRole('term').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(glossary).toHaveCount(0);

  // Le descriptif, le titre modifié (visible chez Alice en moins de 2 s), et « Annuler » n'envoie rien.
  await page.getByRole('button', { name: 'F-1', exact: true }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toContainText('Aucun descriptif.');
  await panel.getByRole('button', { name: 'Modifier le titre et le descriptif' }).click();
  await panel.getByLabel('Titre').fill('Paiement express');
  await panel.getByRole('button', { name: 'Annuler' }).click();
  await expect(alice.getByRole('cell', { name: 'Paiement en un clic' })).toBeVisible();

  await panel.getByRole('button', { name: 'Modifier le titre et le descriptif' }).click();
  await panel.getByLabel('Titre').fill('Paiement express');
  await panel.getByLabel('Descriptif').fill('Sans ressaisie de la carte.');
  await panel.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(panel.getByRole('status')).toContainText(
    'Modification enregistrée et visible par tous les participants',
  );
  await expect(alice.getByRole('cell', { name: 'Paiement express' })).toBeVisible({
    timeout: 2_000,
  });
  await alice.getByRole('button', { name: 'F-1', exact: true }).click();
  await expect(alice.getByRole('dialog')).toContainText('Sans ressaisie de la carte.');
});

test('FR-002 : le lien d’animation ouvre les droits d’animateur dans un autre navigateur', async ({
  browser,
  page,
}) => {
  // Le presse-papiers est remplacé : ce que « Copier mon lien d’animation » copie se relit dans la page.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as unknown as { copied: string }).copied = text;
        },
      },
    });
  });
  await createSession(page);
  await addFeature(page, 'F-1', 'Paiement en un clic', { BV: '8', TC: '5', 'RR/OE': '3', JS: '4' });
  await page.getByRole('button', { name: 'Liens' }).click();
  await page.getByRole('button', { name: 'Copier mon lien d’animation' }).click();
  await expect(page.getByRole('button', { name: 'Copié' })).toBeVisible();
  const animation = await page.evaluate(() => (window as unknown as { copied: string }).copied);
  expect(animation).toContain('/animer#');

  // Un autre navigateur : il rejoint, puis ouvre le lien privé et obtient les droits d'animateur.
  const context = await browser.newContext();
  const other = await context.newPage();
  await other.goto(animation.replace(/\/animer#.*/, ''));
  await other.getByLabel('Votre pseudo').fill('relève');
  await other.getByRole('button', { name: 'Rejoindre' }).click();
  // Une fois dans la session, sans le jeton d'animation : un participant ordinaire.
  await expect(other.getByRole('heading', { level: 1, name: DEMO })).toBeVisible();
  await expect(other.getByRole('button', { name: '+ Fonctionnalité' })).toHaveCount(0);
  await other.goto(animation);
  await expect(other.getByRole('button', { name: '+ Fonctionnalité' })).toBeVisible();
  // Le fragment (le jeton) a disparu de l'adresse.
  expect(other.url()).not.toContain('#');
});
