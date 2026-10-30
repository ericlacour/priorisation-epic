import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import {
  SESSION_ID,
  installFakeSocket,
  push,
  sentOfType,
  storeTokens,
} from './fake-session-socket';
import { F1, F2, F3, manyFeatures, sessionState } from './state-fixtures';

interface Feature {
  id: string;
}

async function open(page: Page, features: unknown[], animate: boolean): Promise<void> {
  await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'UP' } }));
  await installFakeSocket(page);
  await storeTokens(page, { animate });
  await page.goto(`/s/${SESSION_ID}`);
  await push(page, sessionState(features, { animate }));
}

/** La salle ouverte par Éric : BV, toutes les fonctionnalités chacune à son niveau, sauf la dernière non classée. */
function room(features: Feature[], extra: Record<string, unknown> = {}) {
  const ranked = features.slice(0, -1);
  return {
    type: 'rankingRoom',
    active: true,
    facilitatorId: 'p-fac',
    live: true,
    draft: {
      criterionKeys: ['bv', 'js'],
      criterionKey: 'bv',
      levels: ranked.map((f) => [f.id]),
      unranked: features.slice(-1).map((f) => f.id),
      values: Object.fromEntries(ranked.map((f, index) => [f.id, Math.max(10 - index, 1)])),
    },
    opinions: [],
    spotlightFeatureId: null,
    ...extra,
  };
}

const bobRaisesF2 = {
  featureId: F2.id,
  criterionKey: 'bv',
  participantId: 'p-bob',
  opinion: 'RAISE',
  comment: 'Le transporteur est prêt en mars.',
};

test.describe('classement collaboratif, vue animateur (FR-015b, FR-015c)', () => {
  async function startRanking(page: Page): Promise<void> {
    await open(page, [F1, F2, F3], true);
    await page.getByRole('button', { name: 'Prioriser par classement' }).click();
    await page.getByLabel('TC · Time Criticality').uncheck();
    await page.getByLabel('RR/OE · Risk Reduction / Opportunity Enablement').uncheck();
    await page.getByRole('button', { name: 'Commencer le classement' }).click();
  }

  test('diffuse le classement, montre les avis de la salle et agit sur eux', async ({ page }) => {
    await startRanking(page);
    await expect
      .poll(async () => (await sentOfType(page, 'updateRankingDraft')).at(-1))
      .toMatchObject({ live: true, draft: { criterionKeys: ['bv', 'js'], criterionKey: 'bv' } });

    await push(page, room([F1, F2, F3], { opinions: [bobRaisesF2] }));
    const counters = page.locator(`[data-id="${F2.id}"] .opinion-counts`);
    await expect(counters).toBeVisible();
    await counters.click();
    await expect(page.locator('.opinion-popover')).toContainText('Bob');

    const panel = page.locator('app-opinions-panel');
    await expect(panel).toContainText('Le transporteur est prêt en mars.');
    await panel.getByRole('button', { name: 'Mettre en discussion' }).click();
    expect(await sentOfType(page, 'setSpotlight')).toEqual([
      { type: 'setSpotlight', featureId: F2.id },
    ]);
    await panel.getByRole('button', { name: 'Effacer les avis' }).click();
    expect(await sentOfType(page, 'clearOpinions')).toEqual([
      { type: 'clearOpinions', featureId: F2.id, criterionKey: 'bv' },
    ]);
  });

  test('met la diffusion en pause, puis ferme la salle sur « Annuler »', async ({ page }) => {
    await startRanking(page);
    const live = page.getByRole('button', { name: 'Diffusé en direct' });
    await expect(live).toHaveAttribute('aria-pressed', 'true');
    await live.click();
    await expect(page.getByRole('button', { name: 'Diffuser en direct' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect((await sentOfType(page, 'updateRankingDraft')).at(-1)).toEqual({
      type: 'updateRankingDraft',
      live: false,
    });

    await page.getByRole('button', { name: 'Annuler' }).click();
    expect(await sentOfType(page, 'endRanking')).toEqual([
      { type: 'endRanking', outcome: 'CANCELLED' },
    ]);
  });

  test('accessibilité : aucune violation axe avec le panneau des avis', async ({ page }) => {
    await startRanking(page);
    await push(page, room([F1, F2, F3], { opinions: [bobRaisesF2], spotlightFeatureId: F1.id }));
    await expect(page.locator('app-opinions-panel')).toContainText('En discussion');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});

test.describe('classement collaboratif, vue participant (FR-015b, FR-015c)', () => {
  test('suit le classement en lecture seule, donne un avis au clavier avec un commentaire', async ({
    page,
  }) => {
    await open(page, [F1, F2, F3], false);
    await push(page, room([F1, F2, F3]));
    await expect(page.getByRole('heading', { name: 'Classement en direct' })).toBeVisible();
    await expect(page.getByText('Éric classe BV · Business Value')).toBeVisible();
    await expect(page.locator('table.board-table')).toHaveCount(0);
    await expect(page.locator('[draggable="true"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Je monterais : F-2' }).focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByLabel('Un commentaire ? (facultatif, 140 caractères au plus)'),
    ).toBeFocused();
    await page.keyboard.type('Le transporteur est prêt en mars.');
    await page.keyboard.press('Enter');

    expect(await sentOfType(page, 'giveOpinion')).toEqual([
      { type: 'giveOpinion', featureId: F2.id, criterionKey: 'bv', opinion: 'RAISE', value: 10 },
      {
        type: 'giveOpinion',
        featureId: F2.id,
        criterionKey: 'bv',
        opinion: 'RAISE',
        comment: 'Le transporteur est prêt en mars.',
      },
    ]);
  });

  test('dit de combien monter une carte, voit le classement selon la salle et ouvre un descriptif', async ({
    page,
  }) => {
    await open(page, [F1, F2, F3], false);
    await push(page, room([F1, F2, F3]));
    await page.getByRole('button', { name: 'Je descendrais : F-1' }).click();
    await push(
      page,
      room([F1, F2, F3], {
        opinions: [
          {
            featureId: F1.id,
            criterionKey: 'bv',
            participantId: 'p-bob',
            opinion: 'LOWER',
            value: 9,
          },
        ],
      }),
    );
    await page.getByLabel('Valeur souhaitée').selectOption('4');
    expect((await sentOfType(page, 'giveOpinion')).at(-1)).toEqual({
      type: 'giveOpinion',
      featureId: F1.id,
      criterionKey: 'bv',
      opinion: 'LOWER',
      value: 4,
    });

    await push(
      page,
      room([F1, F2, F3], {
        opinions: [
          {
            featureId: F1.id,
            criterionKey: 'bv',
            participantId: 'p-bob',
            opinion: 'LOWER',
            value: 4,
          },
          {
            featureId: F3.id,
            criterionKey: 'bv',
            participantId: 'p-ana',
            opinion: 'RAISE',
            value: 8,
          },
        ],
      }),
    );
    const roomRanking = page.locator('app-room-ranking');
    await expect(roomRanking).toContainText('Classement selon la salle');
    await expect(roomRanking.locator(`[data-id="${F1.id}"] .room-change`)).toHaveText('10 → 4');
    await expect(roomRanking.locator(`[data-id="${F3.id}"] .room-change`)).toHaveText('– → 8');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.locator('.rank-ranked').getByRole('button', { name: 'F-1', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Paiement en un clic' })).toBeVisible();
  });

  test('revient au tableau à la fin du classement, avec la raison', async ({ page }) => {
    await open(page, [F1, F2, F3], false);
    await push(page, room([F1, F2, F3]));
    await expect(page.getByRole('heading', { name: 'Classement en direct' })).toBeVisible();

    await push(page, { type: 'rankingRoom', active: false, endReason: 'FACILITATOR_LEFT' });
    await expect(page.locator('table.board-table')).toBeVisible();
    await expect(page.getByText('L’animateur s’est déconnecté')).toBeVisible();
    await page.getByRole('button', { name: 'Fermer' }).click();
    await expect(page.getByText('L’animateur s’est déconnecté')).toHaveCount(0);
  });

  test('fenêtre de 1280 × 720 : 15 fonctionnalités visibles avec le panneau, sans défilement', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const features = manyFeatures(16) as Feature[];
    await open(page, features, false);
    await push(page, room(features, { opinions: [] }));
    await expect(page.locator('.rank-ranked .rank-item')).toHaveCount(15);
    for (const item of await page.locator('.rank-ranked .rank-item').all()) {
      await expect(item).toBeInViewport({ ratio: 1 });
    }
    await expect(page.locator('.opinions-panel')).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
    ).toBe(true);
  });

  test('sur téléphone, la vue diffusée est en lecture seule, sans avis', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, [F1, F2, F3], false);
    await push(page, room([F1, F2, F3]));
    await expect(page.getByRole('heading', { name: 'Classement en direct' })).toBeVisible();
    await expect(page.getByText('Pour donner votre avis, utilisez un ordinateur.')).toBeVisible();
    await expect(page.locator('.opinion-buttons')).toHaveCount(0);
  });

  test('accessibilité : aucune violation axe sur la vue suivie', async ({ page }) => {
    await open(page, [F1, F2, F3], false);
    await push(
      page,
      room([F1, F2, F3], {
        spotlightFeatureId: F2.id,
        opinions: [{ ...bobRaisesF2, participantId: 'p-me' }],
      }),
    );
    await expect(page.getByRole('heading', { name: 'Classement en direct' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
