import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type WebSocketRoute,
} from '@playwright/test';

import { namePattern, uniqueName } from './session-name';

/**
 * Reconnexion, contre le vrai webservice (quickstart V15). Le réseau d'un navigateur est coupé puis rétabli : le
 * participant se reconnecte seul, sans rejoindre de nouveau, et retrouve l'état de la session, y compris ce qui a
 * changé pendant la coupure.
 */

const DEMO = namePattern('Reconnexion');

const rows = (page: Page) => page.locator('tbody tr');
const rowTexts = async (page: Page) =>
  (await rows(page).allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());

/**
 * Le réseau d'un contexte de navigateur. Les WebSocket de session passent par une route qui les relaie vers le
 * webservice ; `cut()` met le contexte hors ligne et ferme ces connexions des deux côtés, comme une coupure du
 * réseau (le webservice voit le participant partir). Pendant la coupure, chaque tentative de reconnexion échoue
 * aussitôt. `restore()` rétablit le réseau : la tentative suivante du front aboutit.
 */
class Network {
  private offline = false;
  private readonly open = new Set<{ page: WebSocketRoute; server: WebSocketRoute }>();

  private constructor(private readonly context: BrowserContext) {}

  static async of(context: BrowserContext): Promise<Network> {
    const network = new Network(context);
    await context.routeWebSocket(/\/ws\/sessions\//, (page) => {
      if (network.offline) {
        void page.close({ code: 1011, reason: 'réseau coupé' });
        return;
      }
      const link = { page, server: page.connectToServer() };
      network.open.add(link);
      page.onClose(() => {
        network.open.delete(link);
        void link.server.close();
      });
      link.server.onClose(() => {
        network.open.delete(link);
        void page.close();
      });
    });
    return network;
  }

  async cut(): Promise<void> {
    this.offline = true;
    await this.context.setOffline(true);
    for (const link of [...this.open]) {
      this.open.delete(link);
      await link.server.close();
      await link.page.close({ code: 1011, reason: 'réseau coupé' });
    }
  }

  async restore(): Promise<void> {
    this.offline = false;
    await this.context.setOffline(false);
  }
}

/** Crée une session « Reconnexion … » avec le pseudo « anim » et arrive sur son tableau. Renvoie le lien d'invitation. */
async function createSession(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByLabel('Nom de la session').fill(uniqueName('Reconnexion'));
  await page.getByLabel('Votre pseudo').fill('anim');
  await page.getByRole('button', { name: 'Créer la session' }).click();
  await expect(page.getByRole('heading', { name: 'Session créée' })).toBeVisible();
  const [invitation] = await page.locator('code').allInnerTexts();
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

/** Alice rejoint la session dans un navigateur à elle, dont le test peut couper le réseau. */
async function openParticipant(
  browser: Browser,
  invitation: string,
): Promise<{ alice: Page; network: Network }> {
  const context = await browser.newContext();
  const network = await Network.of(context);
  const alice = await context.newPage();
  await alice.goto(invitation);
  await alice.getByLabel('Votre pseudo').fill('alice');
  await alice.getByRole('button', { name: 'Rejoindre' }).click();
  await expect(alice.getByRole('heading', { level: 1, name: DEMO })).toBeVisible();
  return { alice, network };
}

/** Le nombre de participants en ligne, vu par `page` (la liste s'ouvre à la demande). */
async function expectOnline(page: Page, count: number) {
  const list = page.locator('.plist');
  if (!(await list.isVisible())) await page.getByRole('button', { name: /^Participants/ }).click();
  await expect(list.locator('li .dot.on')).toHaveCount(count, { timeout: 20_000 });
}

test('V15 : un participant coupé du réseau se reconnecte seul et retrouve l’état de la session', async ({
  browser,
  page,
}) => {
  const invitation = await createSession(page);
  await addFeature(page, 'F-1', 'Paiement en un clic', { BV: '8', TC: '5', 'RR/OE': '3', JS: '4' });
  const { alice, network } = await openParticipant(browser, invitation);
  await expect.poll(() => rowTexts(alice)).toEqual(['1 F-1 Paiement en un clic 8 5 3 4 16 4,00']);
  await expectOnline(page, 2);

  // Coupure : Alice voit « Reconnexion… », l'animateur la voit hors ligne.
  await network.cut();
  await expect(alice.getByRole('status').filter({ hasText: 'Reconnexion…' })).toBeVisible();
  await expectOnline(page, 1);

  // Pendant la coupure, l'animateur passe le JS de F-1 à 10.
  await rows(page).first().getByRole('button', { name: 'Modifier' }).click();
  await page.getByRole('textbox', { name: 'JS', exact: true }).fill('10');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect
    .poll(() => rowTexts(page))
    .toEqual(['1 F-1 Paiement en un clic 8 5 3 10 16 1,60 Modifier']);
  await expect.poll(() => rowTexts(alice)).toEqual(['1 F-1 Paiement en un clic 8 5 3 4 16 4,00']);

  // Retour du réseau : Alice se reconnecte seule (au plus 10 s d'attente entre deux tentatives), sans rejoindre
  // de nouveau, et voit la modification faite pendant la coupure.
  await network.restore();
  await expect(alice.getByText('Reconnexion…')).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(() => rowTexts(alice)).toEqual(['1 F-1 Paiement en un clic 8 5 3 10 16 1,60']);
  await expect(alice.getByRole('heading', { level: 1, name: DEMO })).toBeVisible();
  await expect(alice.getByRole('button', { name: 'Rejoindre' })).toHaveCount(0);
  await expectOnline(page, 2);
  await expectOnline(alice, 2);

  // La connexion rétablie reçoit de nouveau les modifications en direct.
  await rows(page).first().getByRole('button', { name: 'Modifier' }).click();
  await page.getByRole('textbox', { name: 'BV', exact: true }).fill('9');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(alice.getByRole('cell', { name: '1,70' })).toBeVisible({ timeout: 2_000 });
});

test('V15 : l’animateur coupé du réseau garde sa saisie et ses droits, puis enregistre après la reconnexion', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const network = await Network.of(context);
  const page = await context.newPage();
  const invitation = await createSession(page);
  await addFeature(page, 'F-1', 'Paiement en un clic', { BV: '8', TC: '5', 'RR/OE': '3', JS: '4' });
  const { alice } = await openParticipant(browser, invitation);

  // Coupure pendant une saisie : rien n'est envoyé, la saisie reste ouverte.
  await rows(page).first().getByRole('button', { name: 'Modifier' }).click();
  await page.getByRole('textbox', { name: 'BV', exact: true }).fill('9');
  await network.cut();
  await expect(page.getByRole('status').filter({ hasText: 'Reconnexion…' })).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Connexion perdue : votre modification n’a pas été envoyée.',
  );
  await expect(page.getByRole('textbox', { name: 'BV', exact: true })).toHaveValue('9');

  // Retour du réseau : l'animateur garde ses droits et enregistre la même saisie.
  await network.restore();
  await expect(page.getByText('Reconnexion…')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: '+ Fonctionnalité' })).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.edit-row')).toHaveCount(0);
  await expect
    .poll(() => rowTexts(page))
    .toEqual(['1 F-1 Paiement en un clic 9 5 3 4 17 4,25 Modifier']);
  await expect(alice.getByRole('cell', { name: '4,25' })).toBeVisible({ timeout: 2_000 });
});
