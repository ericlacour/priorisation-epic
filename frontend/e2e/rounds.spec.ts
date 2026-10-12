import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { FACILITATOR_ID, PARTICIPANT_ID, SESSION_ID } from '../src/app/testing/fixtures';
import { FakeSession, feature } from './fake-session-socket';

/** Écrans du tour (4 bis, 5 et 6 des maquettes) servis par un faux serveur : accessibilité, mise en page, intentions. */

const features = () =>
  Array.from({ length: 10 }, (_, i) =>
    feature(`F-${i + 1}`, `Fonctionnalité numéro ${i + 1}`, {
      bv: 1 + (i % 9),
      tc: 2,
      rrOe: 3,
      js: 1 + (i % 7),
    }),
  );

const ids = (fake: FakeSession) => fake.features.map((f) => f.id);

const openRound = (fake: FakeSession, status: 'OPEN' | 'REVEALED' = 'OPEN') => ({
  id: 'round-1',
  number: 1,
  status,
  previousRoundId: null,
  featureIds: ids(fake),
  progress: [
    { participantId: FACILITATOR_ID, completedCount: 1 },
    { participantId: PARTICIPANT_ID, completedCount: 2 },
  ],
  myVotes: status === 'OPEN' ? { [ids(fake)[0]]: { bv: 8, tc: null, rrOe: 3, js: null } } : {},
  results:
    status === 'OPEN'
      ? null
      : ids(fake).map((featureId) => ({
          featureId,
          votes: [
            { participantId: PARTICIPANT_ID, criteria: { bv: 8, tc: 2, rrOe: 3, js: null } },
            { participantId: FACILITATOR_ID, criteria: { bv: 3, tc: 2, rrOe: 3, js: 4 } },
          ],
          nonVoters: [],
          min: { bv: 3, tc: 2, rrOe: 3, js: 4 },
          max: { bv: 8, tc: 2, rrOe: 3, js: 4 },
          largeSpread: ['bv'],
          unanimous: { bv: null, tc: 2, rrOe: 3, js: 4 },
        })),
});

async function open(page: Page, fake: FakeSession, facilitator: boolean): Promise<void> {
  await fake.install(page, { facilitator });
  await page.goto(`/s/${SESSION_ID}`);
  await expect(page.locator('.session-bar')).toBeVisible();
}

const wcag = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollHeight <= innerHeight);

test.use({ viewport: { width: 1280, height: 720 } });

test.describe('animateur', () => {
  test('démarre la session puis ouvre un tour sur la sélection, avec une seule intention chacun', async ({
    page,
  }) => {
    const fake = new FakeSession(features());
    fake.status = 'PREPARATION';
    await open(page, fake, true);
    await expect(page.getByRole('button', { name: 'Ouvrir un tour' })).toBeDisabled();
    await page.getByRole('button', { name: 'Démarrer la session' }).click();
    expect(fake.intents).toEqual([{ type: 'changeStatus', action: 'START' }]);

    fake.status = 'IN_PROGRESS';
    fake.change(() => undefined);
    await page.getByRole('button', { name: 'Ouvrir un tour' }).click();
    expect((await wcag(page)).violations).toEqual([]);
    await page.getByRole('button', { name: 'Non évaluées (0)' }).click();
    await expect(page.getByRole('button', { name: /^Ouvrir le tour/ })).toBeDisabled();
    await page.getByLabel('F-2', { exact: true }).check();
    await page.getByLabel('F-4', { exact: true }).check();
    await page.getByRole('button', { name: 'Ouvrir le tour (2 fonctionnalités)' }).click();
    expect(fake.intents.at(-1)).toEqual({
      type: 'openRound',
      featureIds: ['feature-f-2', 'feature-f-4'],
    });
  });

  test('un tour ouvert de 10 fonctionnalités : vote, tableau, sans défilement de la page', async ({
    page,
  }) => {
    const fake = new FakeSession(features());
    fake.openRounds = [openRound(fake)];
    fake.voting = new Set(ids(fake));
    await open(page, fake, true);
    await expect(page.getByText('Tour 1 en cours sur 10 fonctionnalités')).toBeVisible();
    expect(await noPageScroll(page)).toBe(true);
    expect((await wcag(page)).violations).toEqual([]);
    await expect(page.getByRole('button', { name: 'Modifier F-1', exact: true })).toBeDisabled();

    const vote = page.locator('.vote-feature', { hasText: 'F-1 ·' });
    await vote.getByRole('textbox', { name: /^TC/ }).fill('4');
    await vote.getByRole('textbox', { name: /^TC/ }).blur();
    expect(fake.intents.at(-1)).toEqual({
      type: 'castVote',
      roundId: 'round-1',
      featureId: 'feature-f-1',
      criteria: { bv: 8, tc: 4, rrOe: 3, js: null },
    });
    await page.getByRole('button', { name: 'Révéler le tour 1' }).click();
    expect(fake.intents.at(-1)).toEqual({ type: 'revealRound', roundId: 'round-1' });
  });

  test('un tour révélé de 10 fonctionnalités : la liste défile, la barre d’actions reste visible', async ({
    page,
  }) => {
    const fake = new FakeSession(features());
    fake.lastRevealedRounds = [openRound(fake, 'REVEALED')];
    await open(page, fake, true);
    await expect(page.getByText('Tour 1 révélé')).toBeVisible();
    expect(await noPageScroll(page)).toBe(true);
    expect((await wcag(page)).violations).toEqual([]);
    await expect(
      page.getByRole('button', { name: /^Relancer un tour sur la sélection/ }),
    ).toBeInViewport();
    await page.getByLabel('Relancer un tour sur F-3').check();
    await page.getByRole('button', { name: 'Relancer un tour sur la sélection (1)' }).click();
    expect(fake.intents.at(-1)).toEqual({
      type: 'openRound',
      featureIds: ['feature-f-3'],
      previousRoundId: 'round-1',
    });
  });
});

test.describe('participant', () => {
  test('voit les fonctionnalités en vote masquées, en fin de tableau, sans valeurs', async ({
    page,
  }) => {
    const fake = new FakeSession(features());
    fake.openRounds = [{ ...openRound(fake), featureIds: ids(fake).slice(0, 3) }];
    fake.voting = new Set(ids(fake).slice(0, 3));
    await open(page, fake, false);
    await expect(page.getByText('vote en cours')).toHaveCount(3);
    await expect(page.getByText('Valeurs masquées jusqu')).toHaveCount(3);
    const order = await page.locator('.board tbody tr .fid').allTextContents();
    expect(order.slice(-3).map((s) => s.trim())).toEqual(['F-1', 'F-2', 'F-3']);
    await expect(page.getByRole('button', { name: 'Ouvrir un tour' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Révéler/ })).toHaveCount(0);
    expect((await wcag(page)).violations).toEqual([]);
  });

  test('lit un tour révélé sans champ de consensus', async ({ page }) => {
    const fake = new FakeSession(features());
    fake.lastRevealedRounds = [openRound(fake, 'REVEALED')];
    await open(page, fake, false);
    await expect(page.getByText('Tour 1 révélé')).toBeVisible();
    await expect(page.locator('.reveal-card input')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Relancer/ })).toHaveCount(0);
    expect((await wcag(page)).violations).toEqual([]);
  });
});
