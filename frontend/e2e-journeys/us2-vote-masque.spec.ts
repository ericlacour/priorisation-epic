import { expect, test } from '@playwright/test';

import { addFeature, createSession, ids, joinAs, recordFrames, wsjfOf } from './helpers';

/**
 * US2 contre le vrai webservice (quickstart V4 à V8, SC-004) avec trois postes : l'animateur, alice et bob. On
 * regarde aussi ce qui a réellement circulé sur le WebSocket de bob : aucune valeur d'alice avant la révélation.
 */

/** Les valeurs d'alice sur F-1 : aucune autre valeur de ces parcours ne vaut 7, 6 ou 9. */
const ALICE = { bv: '7', tc: '6', rrOe: '9' };
const ALICE_VALUES = /"(bv|tc|rrOe|js)":(7|6|9)\b/;

test('V4 à V7 : vote masqué, révélation, consensus et relance', async ({ page, browser }) => {
  const invitation = await createSession(page, 'Démo vote', 'anim');
  await addFeature(page, 'F-1', 'Paiement en un clic', ['8', '5', '3', '4']);
  await addFeature(page, 'F-2', 'Export comptable', ['2', '2', '2', '3']);

  // V4 : alice et bob arrivent, apparaissent en ligne et lisent le tableau complet, sans action d'animation.
  const alice = await joinAs(browser, invitation, 'alice');
  const bob = await joinAs(browser, invitation, 'bob');
  const bobFrames = recordFrames(bob.page);
  await bob.page.reload();
  await expect(bob.page.locator('.session-bar')).toBeVisible();
  await expect(page.getByText('Participants (3)')).toBeVisible();
  await expect(page.locator('.plist .dot.on')).toHaveCount(3);
  await expect(alice.page.getByRole('button', { name: '+ Fonctionnalité' })).toHaveCount(0);
  await expect(wsjfOf(alice.page, 0)).toHaveText('4,00');
  await page.getByRole('button', { name: 'Modifier F-2' }).click();
  await page.getByLabel('JS', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(wsjfOf(alice.page, 1)).toHaveText('3,00');

  // V5 : impossible d'ouvrir un tour en préparation ; on démarre, puis on ouvre un tour sur F-1 et F-2.
  await expect(page.getByRole('button', { name: 'Ouvrir un tour' })).toBeDisabled();
  await expect(page.getByText('Démarrez la session pour ouvrir un tour de vote')).toBeVisible();
  await page.getByRole('button', { name: 'Démarrer la session' }).click();
  await expect(page.getByRole('button', { name: 'Ouvrir un tour' })).toBeEnabled();
  await page.getByRole('button', { name: 'Ouvrir un tour' }).click();
  await page.getByRole('button', { name: 'Tout sélectionner', exact: true }).first().click();
  await page.getByRole('button', { name: 'Ouvrir le tour (2 fonctionnalités)' }).click();
  await expect(page.getByText('Tour 1 en cours sur 2 fonctionnalités')).toBeVisible();

  // Chez alice et bob, F-1 et F-2 sont en vote, sans valeurs ni WSJF.
  for (const poste of [alice.page, bob.page]) {
    await expect(poste.getByText('vote en cours')).toHaveCount(2);
    await expect(poste.getByText('valeurs masquées').first()).toBeVisible();
  }

  // Alice vote F-1 (JS laissé vide : « sans avis »), puis les autres voient seulement son avancement.
  const vote = alice.page.locator('.vote-feature', { hasText: 'F-1' });
  await vote.getByRole('textbox', { name: /^BV/ }).fill(ALICE.bv);
  await vote.getByRole('textbox', { name: /^TC/ }).fill(ALICE.tc);
  await vote.getByRole('textbox', { name: /^RR\/OE/ }).fill(ALICE.rrOe);
  await vote.getByRole('textbox', { name: /^RR\/OE/ }).blur();
  await expect(vote.getByText('Noté')).toBeVisible();
  await expect(bob.page.locator('.plist li', { hasText: 'alice' }).locator('.progress')).toHaveText(
    '1 / 2',
  );
  await expect(page.locator('.plist li', { hasText: 'alice' }).locator('.progress')).toHaveText(
    '1 / 2',
  );
  expect(bobFrames.length).toBeGreaterThan(0);
  expect(bobFrames.filter((frame) => ALICE_VALUES.test(frame))).toEqual([]);

  // L'animateur ne peut pas modifier les valeurs d'une fonctionnalité en vote.
  const edit = page.getByRole('button', { name: 'Modifier F-1' });
  await expect(edit).toBeDisabled();
  await expect(edit).toHaveAttribute('title', /en cours de vote/);

  // Une saisie hors échelle est refusée sans rien envoyer.
  await vote.getByRole('textbox', { name: /^JS/ }).fill('11');
  await vote.getByRole('textbox', { name: /^JS/ }).blur();
  await expect(vote.getByText('JS : saisissez un nombre entier entre 1 et 10.')).toBeVisible();
  await vote.getByRole('textbox', { name: /^JS/ }).fill('');
  await vote.getByRole('textbox', { name: /^JS/ }).blur();

  // L'animateur vote aussi (JS = 4), avec les quatre critères.
  const own = page.locator('.vote-feature', { hasText: 'F-1' });
  for (const [label, value] of [
    [/^BV/, '8'],
    [/^TC/, '5'],
    [/^RR\/OE/, '3'],
    [/^JS/, '4'],
  ] as const) {
    await own.getByRole('textbox', { name: label }).fill(value);
  }
  await own.getByRole('textbox', { name: /^JS/ }).blur();
  await expect(own.getByText('Noté')).toBeVisible();

  // V6 : la révélation montre les votes à tous ; bob n'a pas voté ; le JS d'alice est « sans avis ».
  await page.getByRole('button', { name: 'Révéler le tour 1' }).click();
  for (const poste of [page, alice.page, bob.page]) {
    await expect(poste.getByText('Tour 1 révélé')).toBeVisible();
    const grid = poste.locator('.reveal-card', { hasText: 'F-1' });
    await expect(grid.locator('tr', { hasText: 'alice' })).toContainText('sans avis');
    await expect(grid.locator('tr', { hasText: 'alice' })).toContainText('7');
    await expect(grid.locator('tr.novote', { hasText: 'bob' })).toContainText("n'a pas voté");
    await expect(grid.locator('tr.minmax')).toContainText('6 – 6'.replace('6 – 6', '5 – 6'));
    await expect(grid.locator('tr.minmax')).toContainText('écart important');
  }
  expect(bobFrames.some((frame) => ALICE_VALUES.test(frame))).toBe(true);
  // V6a : le JS retenu est prérempli à 4 (seul l'animateur l'a donné), les autres champs restent vides.
  const consensus = page.locator('.reveal-card', { hasText: 'F-1' });
  await expect(consensus.getByLabel('JS retenu')).toHaveValue('4');
  await expect(consensus.getByLabel('BV retenu')).toHaveValue('');
  await expect(alice.page.getByLabel('JS retenu')).toHaveCount(0);

  // V7 : on fixe les valeurs de F-1, puis on relance un tour sur F-2 seule.
  await consensus.getByLabel('BV retenu').fill('8');
  await consensus.getByLabel('TC retenu').fill('5');
  await consensus.getByLabel('RR/OE retenu').fill('3');
  await consensus.getByRole('button', { name: 'Valider' }).click();
  await expect(consensus.getByText('Valeurs retenues enregistrées.')).toBeVisible();
  await expect.poll(() => ids(page)).toEqual(['F-1', 'F-2']);
  await expect(wsjfOf(page, 0)).toHaveText('4,00');

  await page.getByLabel('Relancer un tour sur F-2').check();
  await page.getByRole('button', { name: 'Relancer un tour sur la sélection (1)' }).click();
  await expect(page.getByText('Tour 2 en cours sur 1 fonctionnalité')).toBeVisible();
  await expect(alice.page.getByText('vote en cours')).toHaveCount(1);
  // Le tour 1 reste consultable.
  await page.getByRole('button', { name: 'Tours révélés' }).click();
  await expect(page.getByText('Tour 1 révélé')).toBeVisible();

  await alice.context.close();
  await bob.context.close();
});

test('V8 : transmission du rôle, refusée vers un participant déconnecté puis acceptée', async ({
  page,
  browser,
}) => {
  const invitation = await createSession(page, 'Démo rôle', 'anim');
  await addFeature(page, 'F-1', 'Paiement', ['8', '5', '3', '4']);
  const alice = await joinAs(browser, invitation, 'alice');
  const bob = await joinAs(browser, invitation, 'bob');
  await expect(page.locator('.plist .dot.on')).toHaveCount(3);

  // Bob se déconnecte : l'action est désactivée pour lui, avec son explication.
  await bob.context.close();
  await expect(page.locator('.plist .dot.off')).toHaveCount(1);
  const toBob = page.getByRole('button', { name: "Transmettre le rôle d'animateur à bob" });
  await expect(toBob).toBeDisabled();
  await expect(toBob.locator('..')).toHaveAttribute('title', "Ce participant n'est pas connecté");

  // Alice, connectée, reçoit le rôle : l'ancien animateur perd ses droits, le nouveau les a.
  await page.getByRole('button', { name: "Transmettre le rôle d'animateur à alice" }).click();
  await page.getByRole('button', { name: 'Transmettre', exact: true }).click();
  await expect(page.getByRole('button', { name: '+ Fonctionnalité' })).toHaveCount(0);
  await expect(alice.page.getByRole('button', { name: '+ Fonctionnalité' })).toBeVisible();
  await expect(alice.page.getByText("Vous êtes maintenant l'animateur")).toBeVisible();

  // Le nouveau lien d'animation d'alice est rangé et fonctionne dans un autre navigateur.
  await alice.page.getByRole('button', { name: "Afficher mon lien d'animation" }).click();
  const link = (await alice.page.locator('.secret code').textContent())!.trim();
  expect(link).toContain('/animer#');

  const other = await browser.newContext();
  const takeover = await other.newPage();
  await takeover.goto(link);
  await takeover.getByLabel('Votre pseudo').fill('carol');
  await takeover.getByRole('button', { name: 'Rejoindre' }).click();
  await expect(takeover.getByRole('button', { name: '+ Fonctionnalité' })).toBeVisible();
  // Prendre le rôle par le lien d'animation le retire à l'animateur précédent (un seul animateur).
  await expect(alice.page.getByRole('button', { name: '+ Fonctionnalité' })).toHaveCount(0);
  await other.close();
  await alice.context.close();
});

test('FR-014a : un tour de 10 fonctionnalités tient dans 1280 × 720 sans défilement de la page', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const invitation = await createSession(page, 'Démo mise en page', 'anim');
  for (let i = 1; i <= 10; i++) {
    await addFeature(page, `F-${i}`, `Fonctionnalité numéro ${i}`, [
      '3',
      '4',
      '5',
      String(1 + (i % 5)),
    ]);
  }
  const alice = await joinAs(browser, invitation, 'alice');
  await alice.page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Démarrer la session' }).click();
  await page.getByRole('button', { name: 'Ouvrir un tour' }).click();
  await page.getByRole('button', { name: 'Tout sélectionner', exact: true }).first().click();
  await page.getByRole('button', { name: 'Ouvrir le tour (10 fonctionnalités)' }).click();
  await expect(alice.page.getByText('Tour 1 en cours sur 10 fonctionnalités')).toBeVisible();

  const noPageScroll = (poste: typeof page) =>
    poste.evaluate(() => document.documentElement.scrollHeight <= innerHeight);
  expect(await noPageScroll(page)).toBe(true);
  expect(await noPageScroll(alice.page)).toBe(true);
  // Le panneau de vote défile de son côté : le dernier champ est atteignable.
  await alice.page.locator('.vote-feature', { hasText: 'F-10' }).scrollIntoViewIfNeeded();
  await expect(alice.page.locator('.vote-feature', { hasText: 'F-10' })).toBeVisible();

  await page.getByRole('button', { name: 'Révéler le tour 1' }).click();
  await expect(page.getByText('Tour 1 révélé')).toBeVisible();
  expect(await noPageScroll(page)).toBe(true);
  // Seule la liste des résultats défile : la barre d'actions reste visible.
  await expect(
    page.getByRole('button', { name: /Relancer un tour sur la sélection/ }),
  ).toBeInViewport();
  await alice.context.close();
});
