import { expect, test, type Page } from '@playwright/test';

/**
 * US5 : revoir une session passée, contre le vrai webservice (quickstart V13). L'animateur démarre puis clôture la
 * session (« Annuler » dans la confirmation ne change rien) ; elle passe en lecture seule pour tous. Un visiteur
 * l'ouvre depuis la liste des sessions sans la rejoindre et voit le même tableau. L'animateur la rouvre avec son
 * lien d'animation, depuis un autre navigateur. Les tours révélés s'ajoutent avec le vote masqué (T083).
 */

const FEATURES = [
  'Identifiant;Titre;BV;TC;RR/OE;JS',
  'F-1;Paiement en un clic;8;5;3;4',
  'F-2;Export comptable;2;2;2;3',
  'F-3;Recherche;10;8;5;2',
].join('\n');

const rows = (page: Page) => page.locator('tbody tr');
const rowTexts = async (page: Page) =>
  (await rows(page).allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());
const badge = (page: Page) => page.locator('.session-sub .badge');
const actionBar = (page: Page) => page.locator('.action-bar');

/** Crée la session et arrive sur son tableau. Renvoie le lien d'animation. */
async function createSession(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('Nom de la session').fill(name);
  await page.getByLabel('Votre pseudo').fill('anim');
  await page.getByRole('button', { name: 'Créer la session' }).click();
  await expect(page.getByRole('heading', { name: 'Session créée' })).toBeVisible();
  const [, animation] = await page.locator('code').allInnerTexts();
  await page.getByRole('button', { name: 'Aller à la session' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  return animation;
}

async function importFeatures(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Importer des fonctionnalités' });
  await dialog.getByLabel('Fichier à importer').setInputFiles({
    name: 'features.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(FEATURES, 'utf8'),
  });
  await dialog.getByRole('button', { name: 'Importer 3 lignes' }).click();
  await dialog.getByRole('button', { name: 'Terminer' }).click();
  await expect(rows(page)).toHaveCount(3);
}

/** Le tableau est en lecture seule : ni « Modifier », ni action d'animation autre que « Rouvrir ». */
async function expectReadOnly(page: Page): Promise<void> {
  await expect(badge(page)).toHaveText('Clôturée');
  await expect(actionBar(page)).toContainText('Session clôturée : lecture seule');
  await expect(page.getByRole('button', { name: 'Modifier' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ Fonctionnalité' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Importer', exact: true })).toHaveCount(0);
}

test('démarrer, clôturer, consulter depuis la liste, puis rouvrir avec le lien d’animation (V13)', async ({
  page,
  browser,
}) => {
  const name = `Bilan PI ${Date.now()}`;
  const animation = await createSession(page, name);
  await importFeatures(page);
  await expect(badge(page)).toHaveText('En préparation');

  await page.getByRole('button', { name: 'Démarrer la session' }).click();
  await expect(badge(page)).toHaveText('En cours');

  // « Annuler » dans la confirmation ne change rien.
  await page.getByRole('button', { name: 'Clôturer la session' }).click();
  const confirm = page.getByRole('dialog', { name: 'Clôturer la session ?' });
  await expect(confirm).toContainText(
    'Elle passera en lecture seule pour tous. Vous pourrez la rouvrir.',
  );
  await confirm.getByRole('button', { name: 'Annuler' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(badge(page)).toHaveText('En cours');

  await page.getByRole('button', { name: 'Clôturer la session' }).click();
  await confirm.getByRole('button', { name: 'Clôturer la session' }).click();
  await expectReadOnly(page);
  await expect(actionBar(page).getByRole('button')).toHaveText(['Rouvrir la session']);
  const board = await rowTexts(page);

  // Un visiteur, sans jeton : la liste des sessions, puis le tableau en lecture seule, sans rejoindre.
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto('/');
  const line = visitor.getByRole('table', { name: 'Liste des sessions' }).locator('tr', {
    hasText: name,
  });
  await expect(line).toContainText('anim');
  await expect(line).toContainText('WSJF v2');
  await expect(line).toContainText('Clôturée');
  await line.getByRole('link', { name: `Ouvrir la session ${name}` }).click();
  await expect(visitor.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(visitor.getByRole('button', { name: 'Rejoindre' })).toHaveCount(0);
  await expectReadOnly(visitor);
  expect(await rowTexts(visitor)).toEqual(board);

  // L'animateur retrouve sa session dans la liste : toujours en lecture seule.
  await page.goto('/');
  await page.getByRole('link', { name: `Ouvrir la session ${name}` }).click();
  await expectReadOnly(page);
  expect(await rowTexts(page)).toEqual(board);

  // Depuis un autre navigateur, son lien d'animation le fait rejoindre, puis rouvrir la session.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await other.goto(animation);
  await other.getByLabel('Votre pseudo').fill('anim-portable');
  await other.getByRole('button', { name: 'Rejoindre' }).click();
  await expectReadOnly(other);
  await other.getByRole('button', { name: 'Rouvrir la session' }).click();
  await expect(badge(other)).toHaveText('En cours');

  // La session redevient modifiable, chez l'animateur en direct.
  await expect(badge(page)).toHaveText('En cours');
  await expect(page.getByRole('button', { name: 'Modifier' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clôturer la session' })).toBeVisible();

  await visitorContext.close();
  await otherContext.close();
});
