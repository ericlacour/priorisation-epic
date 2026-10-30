import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { SESSION_ID, installFakeSocket, push, storeTokens } from './fake-session-socket';
import { F1, F2, F3, feature, manyFeatures, sessionState } from './state-fixtures';

/**
 * Passe d'accessibilité (T117, constitution IV), sur Chromium, Firefox et WebKit :
 * - axe-core ne trouve aucune violation sur chaque écran de la version 1, en thème clair et en thème sombre ;
 * - chaque écran se parcourt au clavier, et la définition d'un sigle WSJF s'affiche au focus ;
 * - sur un écran de portable de 1280 px, le budget de place de T097b tient dans tous les états de l'écran de session.
 */

const SCHEMES = ['light', 'dark'] as const;

/** Aucune violation axe-core sur la page telle qu'elle est affichée. */
async function expectNoViolations(page: Page): Promise<void> {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

/**
 * La touche qui passe au contrôle suivant. Safari sur macOS ne s'arrête que sur les champs avec Tab ; Alt+Tab y
 * parcourt aussi les boutons et les liens.
 */
function tabKey(browserName: string): string {
  return browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
}

/** Appuie sur Tab jusqu'à donner le focus à `target` ; échoue au-delà de `max` appuis. */
async function tabTo(page: Page, key: string, target: Locator, max = 40): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(key);
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`${String(target)} n'a pas reçu le focus en ${max} appuis sur ${key}`);
}

/** Les méthodes proposées à la création, telles que le contrat les décrit. */
const METHODS: unknown = JSON.parse(
  readFileSync('../contract/examples/method-list/wsjf-only.json', 'utf8'),
);

/** La réponse de création du contrat, avec ses jetons factices (`contract/examples/` est exempté par Gitleaks). */
const CREATED: object = JSON.parse(
  readFileSync('../contract/examples/create-session-response/created.json', 'utf8'),
);

const SESSIONS = [
  {
    sessionId: 'Qm7tY2wR9pLk4XcV8bNz3D',
    name: 'PI 28 – Epics',
    facilitatorPseudo: 'Camille',
    createdAt: '2026-10-14T12:00:00Z',
    status: 'IN_PROGRESS',
    method: 'WSJF',
    methodVersion: 2,
  },
  {
    sessionId: 'Hn4cR8vT1kWq6ZsJ0dXe5F',
    name: 'PI 27 – Bilan',
    facilitatorPseudo: 'Éric',
    createdAt: '2026-09-30T12:00:00Z',
    status: 'CLOSED',
    method: 'WSJF',
    methodVersion: 2,
  },
];

/** L'accueil, avec un faux webservice : la liste des sessions et la création. */
async function openHome(page: Page): Promise<void> {
  await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'UP' } }));
  await page.route('**/api/methods', (route) => route.fulfill({ json: METHODS }));
  await page.route('**/api/sessions', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 201,
          json: { ...CREATED, sessionId: SESSION_ID },
        })
      : route.fulfill({ json: SESSIONS }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('table', { name: 'Liste des sessions' }).locator('tbody tr'),
  ).toHaveCount(2);
}

/** L'écran de session avec un faux socket ; `animate` range aussi le jeton d'animation. */
async function openSession(
  page: Page,
  options: { animate: boolean; status?: string; features?: unknown[] },
): Promise<void> {
  await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'UP' } }));
  await installFakeSocket(page);
  await storeTokens(page, { animate: options.animate });
  await page.goto(`/s/${SESSION_ID}`);
  await push(page, {
    ...sessionState(options.features ?? [F1, F2, F3], { animate: options.animate }),
    status: options.status ?? 'PREPARATION',
  });
  await expect(page.locator('tbody tr')).toHaveCount((options.features ?? [F1, F2, F3]).length);
}

/** La vue en lecture seule que `GET /api/sessions/{id}` renvoie : sans destinataire (`me` vaut `null`). */
function restView(status: string) {
  return { ...sessionState([F1, F2, F3]), status, me: null };
}

for (const scheme of SCHEMES) {
  test.describe(`axe-core, thème ${scheme === 'light' ? 'clair' : 'sombre'}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
    });

    test('accueil, détail de la méthode, session créée', async ({ page }) => {
      await openHome(page);
      await expectNoViolations(page);

      await page.getByRole('button', { name: 'Voir le détail de la méthode' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectNoViolations(page);
      await page.keyboard.press('Escape');

      // Champs vides : les messages d'erreur sous les champs.
      await page.getByRole('button', { name: 'Créer la session' }).click();
      await expect(page.getByText('Saisissez le nom de la session')).toBeVisible();
      await expectNoViolations(page);

      await page.getByLabel('Nom de la session').fill('Atelier Q4');
      await page.getByLabel('Votre pseudo').fill('Éric');
      await page.getByRole('button', { name: 'Créer la session' }).click();
      await expect(page.getByRole('heading', { name: 'Session créée' })).toBeVisible();
      await expectNoViolations(page);
    });

    test('rejoindre : pseudo déjà utilisé ; session introuvable ; réveil du service', async ({
      page,
    }) => {
      await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'UP' } }));
      await page.route(`**/api/sessions/${SESSION_ID}`, (route) =>
        route.fulfill({ json: restView('IN_PROGRESS') }),
      );
      await page.route(`**/api/sessions/${SESSION_ID}/participants`, (route) =>
        route.fulfill({
          status: 409,
          contentType: 'application/problem+json',
          json: {
            type: 'about:blank',
            title: 'Pseudo déjà utilisé',
            status: 409,
            detail: 'Ce pseudo est déjà utilisé dans cette session. Choisissez-en un autre.',
          },
        }),
      );
      await page.goto(`/s/${SESSION_ID}`);
      await expect(page.getByRole('heading', { name: 'Rejoindre la session' })).toBeVisible();
      await expectNoViolations(page);
      await page.getByLabel('Votre pseudo').fill('Camille');
      await page.getByRole('button', { name: 'Rejoindre' }).click();
      await expect(page.getByText('Ce pseudo est déjà utilisé dans la session.')).toBeVisible();
      await expectNoViolations(page);

      await page.route(`**/api/sessions/Unknown0Unknown0Unkno0`, (route) =>
        route.fulfill({
          status: 404,
          contentType: 'application/problem+json',
          json: {
            type: 'about:blank',
            title: 'Session introuvable',
            status: 404,
            detail: "Cette session n'existe pas : vérifiez le lien auprès de l'animateur.",
          },
        }),
      );
      await page.goto('/s/Unknown0Unknown0Unkno0');
      await expect(page.getByRole('heading', { name: 'Session introuvable' })).toBeVisible();
      await expectNoViolations(page);

      await page.unroute('**/api/health');
      await page.route('**/api/health', (route) => route.fulfill({ status: 503, body: '' }));
      await page.goto('/');
      await expect(page.getByText('Réveil du service…')).toBeVisible();
      await expectNoViolations(page);
    });

    test('tableau de l’animateur : statuts, saisie, panneaux, fenêtres et menus', async ({
      page,
    }) => {
      for (const status of ['PREPARATION', 'IN_PROGRESS', 'CLOSED']) {
        await openSession(page, { animate: true, status });
        await expectNoViolations(page);
      }
      await openSession(page, { animate: true, status: 'IN_PROGRESS' });

      await page.locator('tbody tr').first().getByRole('button', { name: 'Modifier' }).click();
      await page.getByRole('textbox', { name: 'JS', exact: true }).fill('0');
      await page.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(page.getByRole('alert')).toBeVisible();
      await expectNoViolations(page);
      await page.getByRole('button', { name: 'Annuler' }).click();

      const steps: [string | RegExp, Locator][] = [
        ['F-1', page.getByRole('dialog')],
        ['Comprendre le WSJF', page.getByRole('dialog', { name: 'Comprendre le WSJF' })],
        ['Importer', page.getByRole('dialog', { name: 'Importer des fonctionnalités' })],
        ['Échelle', page.getByRole('dialog', { name: 'Échelle des valeurs' })],
        ['Clôturer la session', page.getByRole('dialog', { name: 'Clôturer la session ?' })],
      ];
      for (const [name, dialog] of steps) {
        await page.getByRole('button', { name, exact: true }).click();
        await expect(dialog).toBeVisible();
        await expectNoViolations(page);
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
      }

      await page.getByRole('button', { name: 'Exporter' }).click();
      await expect(page.getByRole('menu', { name: 'Exporter' })).toBeVisible();
      await expectNoViolations(page);
      await page.keyboard.press('Escape');
      for (const name of [/^Liens/, /^Participants/]) {
        await page.locator('.session-bar').getByRole('button', { name }).click();
        await expectNoViolations(page);
        await page.keyboard.press('Escape');
      }
    });

    test('tableau du participant, perte de connexion, session clôturée en lecture seule', async ({
      page,
    }) => {
      await openSession(page, { animate: false, status: 'IN_PROGRESS' });
      await expectNoViolations(page);
      await page.evaluate(() =>
        (window as unknown as { __closeSocket: (code: number) => void }).__closeSocket(1006),
      );
      await expect(page.getByText('Reconnexion…')).toBeVisible();
      await expectNoViolations(page);

      // Sans jeton : la session clôturée s'ouvre en lecture seule, sans connexion.
      const reader = await page.context().newPage();
      await reader.emulateMedia({ colorScheme: scheme });
      await reader.route('**/api/health', (route) => route.fulfill({ json: { status: 'UP' } }));
      await reader.route(`**/api/sessions/${SESSION_ID}`, (route) =>
        route.fulfill({ json: restView('CLOSED') }),
      );
      await reader.addInitScript(() => localStorage.clear());
      await reader.goto(`/s/${SESSION_ID}`);
      await expect(reader.locator('tbody tr')).toHaveCount(3);
      await expectNoViolations(reader);
    });

    test('prioriser par classement : choix, puis classement d’un critère', async ({ page }) => {
      await openSession(page, { animate: true });
      await page.getByRole('button', { name: 'Prioriser par classement' }).click();
      await expect(page.getByRole('heading', { name: 'Prioriser par classement' })).toBeVisible();
      await expectNoViolations(page);
      await page.getByRole('button', { name: 'Commencer le classement' }).click();
      await expect(page.getByRole('button', { name: 'Critère suivant' })).toBeVisible();
      await expectNoViolations(page);
    });
  });
}

test.describe('navigation au clavier', () => {
  test('accueil : les champs, le détail de la méthode et la création, sans souris', async ({
    page,
    browserName,
  }) => {
    const tab = tabKey(browserName);
    await openHome(page);
    await tabTo(page, tab, page.getByLabel('Nom de la session'));
    await page.keyboard.type('Atelier Q4');
    await tabTo(page, tab, page.getByLabel('Votre pseudo'));
    await page.keyboard.type('Éric');

    const detail = page.getByRole('button', { name: 'Voir le détail de la méthode' });
    await tabTo(page, tab, detail);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(detail).toBeFocused();

    await tabTo(page, tab, page.getByRole('button', { name: 'Créer la session' }));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Session créée' })).toBeVisible();
  });

  test('tableau : définition d’un sigle au focus, descriptif et saisie d’une ligne, sans souris', async ({
    page,
    browserName,
  }) => {
    const tab = tabKey(browserName);
    await openSession(page, { animate: true });

    // FR-016a : la définition de chaque sigle s'affiche au focus, et disparaît en le quittant.
    const head = page.locator('thead');
    await tabTo(page, tab, head.getByRole('button', { name: /^BV,/ }));
    await expect(page.getByRole('tooltip')).toHaveText(
      'Business Value : Valeur apportée aux utilisateurs ou au business.',
    );
    await page.keyboard.press(tab);
    await expect(head.getByRole('button', { name: /^TC,/ })).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveText(
      'Time Criticality : Importance de réaliser rapidement la fonctionnalité.',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);

    // Le descriptif s'ouvre avec Entrée et se ferme avec Échap, le focus revient sur l'identifiant.
    const openF1 = page.getByRole('button', { name: 'F-1', exact: true });
    await tabTo(page, tab, openF1);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toContainText('Paiement en un clic');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(openF1).toBeFocused();

    // Saisie d'une ligne au clavier.
    await tabTo(
      page,
      tab,
      page.locator('tbody tr').first().getByRole('button', { name: 'Modifier' }),
    );
    await page.keyboard.press('Enter');
    const js = page.getByRole('textbox', { name: 'JS', exact: true });
    await tabTo(page, tab, js);
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('10');
    await tabTo(page, tab, page.getByRole('button', { name: 'Enregistrer' }));
    await page.keyboard.press('Enter');
    await expect
      .poll(async () =>
        page.evaluate(() =>
          (window as unknown as { __sent: { type: string }[] }).__sent.filter(
            (message) => message.type === 'updateFeature',
          ),
        ),
      )
      .toEqual([
        { type: 'updateFeature', featureId: F1.id, version: F1.version, criteria: { js: 10 } },
      ]);
  });

  test('les fenêtres gardent le focus et le rendent à leur bouton à la fermeture', async ({
    page,
    browserName,
  }) => {
    const tab = tabKey(browserName);
    await openSession(page, { animate: true });
    const scale = page.getByRole('button', { name: 'Échelle', exact: true });
    await tabTo(page, tab, scale);
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Échelle des valeurs' });
    await expect(dialog).toBeVisible();
    // Le focus reste dans la fenêtre, quel que soit le nombre d'appuis sur Tab.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press(tab);
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(scale).toBeFocused();
  });
});

test.describe('écran de portable de 1280 px : budget de place de T097b dans tous les états', () => {
  /** Hauteur d'une barre d'une seule ligne : au-delà, un bouton est passé à la ligne (board-layout.spec.ts). */
  const BARS_MAX = 105;

  async function expectBudget(page: Page): Promise<void> {
    const bars = await page.evaluate(() =>
      ['.session-bar', '.action-bar'].map((selector) => {
        // Un participant n'a pas de barre d'actions tant que la session est ouverte.
        const bar = document.querySelector(selector) as HTMLElement | null;
        if (!bar) return { height: 0, overflow: false };
        return {
          height: bar.getBoundingClientRect().height,
          overflow: bar.scrollWidth > bar.clientWidth,
        };
      }),
    );
    expect(bars[0].height + bars[1].height).toBeLessThanOrEqual(BARS_MAX);
    expect(bars.map((bar) => bar.overflow)).toEqual([false, false]);
    for (const row of (await page.locator('tbody tr').all()).slice(0, 15)) {
      await expect(row).toBeInViewport({ ratio: 1 });
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
    ).toBe(true);
  }

  /** Nom de session de 120 caractères, une fonctionnalité à revoir et douze participants. */
  function crowdedState(animate: boolean, status: string) {
    const features = manyFeatures(20);
    features[0] = {
      ...feature({
        id: '00000000-0000-4000-8000-000000000000',
        externalId: 'F-1',
        title: 'Fonctionnalité à revoir',
        criteria: { bv: 5, tc: 5, rrOe: 5, js: 5 },
        computed: ['15', '3,00', 'CoD = 5 + 5 + 5 = 15 ; WSJF = 15 / 5 = 3,00'],
        rank: 1,
        markedForReview: true,
      }),
      reviewReason: 'Valeurs à confirmer avec la finance.',
    };
    const state = sessionState(features, { animate });
    return {
      ...state,
      status,
      name: 'Atelier de priorisation du programme '.padEnd(120, 'x'),
      participants: [
        ...state.participants,
        ...Array.from({ length: 10 }, (_, i) => ({
          participantId: `p-${i}`,
          pseudo: `Participant ${i + 1}`,
          role: 'PARTICIPANT',
          businessRole: 'Product Owner',
          online: i % 2 === 0,
        })),
      ],
    };
  }

  for (const scheme of SCHEMES) {
    for (const animate of [true, false]) {
      for (const status of ['PREPARATION', 'IN_PROGRESS', 'CLOSED']) {
        test(`${scheme}, ${animate ? 'animateur' : 'participant'}, ${status} : nom long, à revoir, refus et reconnexion`, async ({
          page,
        }) => {
          await page.emulateMedia({ colorScheme: scheme });
          await page.setViewportSize({ width: 1280, height: 560 });
          await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'UP' } }));
          await installFakeSocket(page);
          await storeTokens(page, { animate });
          await page.goto(`/s/${SESSION_ID}`);
          await push(page, crowdedState(animate, status));
          await expect(page.locator('tbody tr')).toHaveCount(20);
          await expectBudget(page);

          if (animate) {
            await push(page, { type: 'error', code: 'INVALID_VALUE' });
            await expect(page.getByRole('alert')).toBeVisible();
            await expectBudget(page);
          }
          await page.evaluate(() =>
            (window as unknown as { __closeSocket: (code: number) => void }).__closeSocket(1006),
          );
          await expect(page.getByText('Reconnexion…')).toBeVisible();
          await expectBudget(page);
        });
      }
    }
  }
});
