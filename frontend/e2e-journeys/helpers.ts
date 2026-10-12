import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

/** Gestes communs des parcours : tout passe par l'interface, rien n'est préparé en base. */
export const WSJF_COLUMN = 8;

export async function createSession(page: Page, name: string, pseudo: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('Nom de la session').fill(name);
  await page.getByLabel('Votre pseudo').fill(pseudo);
  await page.getByRole('button', { name: 'Créer la session' }).click();
  await expect(page.getByText('Votre session est prête')).toBeVisible();
  const invitation = (await page.locator('app-link-box code').first().textContent())!.trim();
  await page.getByRole('button', { name: 'Aller à la session' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  return invitation;
}

export async function addFeature(
  page: Page,
  id: string,
  title: string,
  values: readonly [string, string, string, string],
): Promise<void> {
  await page.getByRole('button', { name: '+ Fonctionnalité' }).click();
  await page.getByLabel('Identifiant de la fonctionnalité').fill(id);
  await page.getByLabel('Titre', { exact: true }).fill(title);
  for (const [i, label] of ['BV', 'TC', 'RR/OE', 'JS'].entries()) {
    await page.getByLabel(label, { exact: true }).fill(values[i]);
  }
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('tr.edit-row')).toHaveCount(0);
}

export const ids = async (page: Page) =>
  (await page.locator('.board tbody tr .fid').allTextContents()).map((id) => id.trim());

export const wsjfOf = (page: Page, row: number) =>
  page.locator('.board tbody tr').nth(row).locator('td').nth(WSJF_COLUMN);

/** Un second poste, dans son propre contexte de navigateur, qui rejoint la session par le lien d'invitation. */
export async function joinAs(
  browser: Browser,
  invitation: string,
  pseudo: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(invitation);
  await page.getByLabel('Votre pseudo').fill(pseudo);
  await page.getByRole('button', { name: 'Rejoindre' }).click();
  // L'écran « Rejoindre » a aussi un titre : on attend la session elle-même, jeton rangé et connexion établie.
  await expect(page.locator('.session-bar')).toBeVisible();
  return { context, page };
}

/** Les trames reçues par une page sur ses WebSockets, pour vérifier ce qui a vraiment circulé (SC-004). */
export function recordFrames(page: Page): string[] {
  const frames: string[] = [];
  page.on('websocket', (socket) => {
    socket.on('framereceived', (event) => frames.push(String(event.payload)));
  });
  return frames;
}
