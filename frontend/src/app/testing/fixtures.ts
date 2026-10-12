import {
  CriteriaValues,
  Feature,
  FeatureResult,
  MethodDefinition,
  Participant,
  Round,
  Score,
  SessionState,
} from '../api/contract';

/** Données de test partagées, calquées sur `contract/examples/`. Aucune n'est utilisée en production. */

export const SESSION_ID = 'k3Jx9QvT2mLpZ8wR4nYb7A';

export const WSJF: MethodDefinition = {
  key: 'WSJF',
  version: 1,
  name: 'WSJF',
  criteria: [
    {
      key: 'bv',
      code: 'BV',
      label: 'Business Value',
      definition: 'Valeur apportée aux utilisateurs ou à l’entreprise.',
      header: 'BV',
    },
    {
      key: 'tc',
      code: 'TC',
      label: 'Time Criticality',
      definition: 'Urgence : la valeur diminue avec le temps.',
      header: 'TC',
    },
    {
      key: 'rrOe',
      code: 'RR/OE',
      label: 'Risk Reduction / Opportunity Enablement',
      definition: 'Risque réduit ou opportunité ouverte.',
      header: 'RR/OE',
    },
    {
      key: 'js',
      code: 'JS',
      label: 'Job Size',
      definition: 'Taille relative du travail nécessaire.',
      header: 'JS',
    },
  ],
  computedValues: [
    {
      key: 'cod',
      code: 'CoD',
      label: 'Cost of Delay',
      definition: 'Coût du retard : BV + TC + RR/OE.',
      header: 'CoD',
      display: 'INTEGER',
    },
    {
      key: 'wsjf',
      code: 'WSJF',
      label: 'Weighted Shortest Job First',
      definition: 'CoD / JS. Plus il est élevé, plus la fonctionnalité est prioritaire.',
      header: 'WSJF',
      display: 'DECIMAL_2',
    },
  ],
  formula: 'CoD = BV + TC + RR/OE ; WSJF = CoD / JS',
  tieBreakRule: 'WSJF décroissant, puis CoD décroissant, puis identifiant croissant.',
};

/** Méthode fictive à deux critères : le front ne doit contenir aucun code propre au WSJF (SC-009). */
export const REACH_EFFORT: MethodDefinition = {
  key: 'REACH_EFFORT',
  version: 1,
  name: 'Portée sur effort',
  criteria: [
    {
      key: 'reach',
      code: 'Portée',
      label: 'Reach',
      definition: 'Nombre de personnes touchées.',
      header: 'Reach',
    },
    {
      key: 'effort',
      code: 'Effort',
      label: 'Effort',
      definition: 'Travail nécessaire pour livrer.',
      header: 'Effort',
    },
  ],
  computedValues: [
    {
      key: 'ratio',
      code: 'Ratio',
      label: 'Reach / Effort',
      definition: 'Portée divisée par effort.',
      header: 'Ratio',
      display: 'DECIMAL_2',
    },
  ],
  formula: 'Ratio = Portée / Effort',
  tieBreakRule: 'Ratio décroissant, puis identifiant croissant.',
};

export const FACILITATOR_ID = 'a1b2c3d4-0001-4000-8000-000000000001';
export const PARTICIPANT_ID = 'a1b2c3d4-0002-4000-8000-000000000002';
export const BOB_ID = 'a1b2c3d4-0003-4000-8000-000000000003';
export const ROUND_ID = 'b0c1d2e3-f4a5-4b6c-8d7e-9f0a1b2c3d4e';

/** Un score calculé : `computed` est déjà formaté par le serveur. */
export function computedScore(
  computed: Record<string, string>,
  rank: number | null = null,
  overrides: Partial<Score> = {},
): Score {
  return {
    complete: true,
    outOfScale: [],
    computed: Object.fromEntries(
      Object.entries(computed).map(([key, display]) => [
        key,
        { numerator: 1, denominator: 1, display },
      ]),
    ),
    explanation: null,
    rank,
    ...overrides,
  };
}

export function feature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f',
    externalId: 'F-1',
    title: 'Paiement en un clic',
    description: 'Payer en un seul clic.',
    version: 0,
    markedForReview: false,
    reviewReason: null,
    votingInProgress: false,
    criteria: { bv: 8, tc: 5, rrOe: 3, js: 4 },
    score: computedScore({ cod: '16', wsjf: '4,00' }, 1, {
      explanation: 'CoD = 8 + 5 + 3 = 16 ; WSJF = 16 / 4 = 4,00',
    }),
    ...overrides,
  };
}

/** Une fonctionnalité dont il manque des critères : aucune valeur calculée. */
export function incompleteFeature(overrides: Partial<Feature> = {}): Feature {
  return feature({
    id: '7a2d3e4f-5c6b-4d8e-9fa0-1b2c3d4e5f60',
    externalId: 'F-3',
    title: 'Programme de fidélité',
    criteria: { bv: 6, tc: null, rrOe: null, js: null },
    score: { complete: false, outOfScale: [], computed: null, explanation: null, rank: null },
    ...overrides,
  });
}

/** Une fonctionnalité dont une valeur sort de l'échelle (FR-011). */
export function outOfScaleFeature(overrides: Partial<Feature> = {}): Feature {
  return feature({
    id: '8b3e4f50-6d7c-4e9f-a0b1-2c3d4e5f6071',
    externalId: 'F-5',
    title: 'Recherche',
    criteria: { bv: 7, tc: 2, rrOe: 4, js: 13 },
    score: { complete: false, outOfScale: ['js'], computed: null, explanation: null, rank: null },
    ...overrides,
  });
}

/** Une fonctionnalité masquée pendant un tour ouvert (FR-019a). */
export function maskedFeature(overrides: Partial<Feature> = {}): Feature {
  return feature({
    id: '9c4f5061-7e8d-4fa0-b1c2-3d4e5f607182',
    externalId: 'F-2',
    title: 'Notifications',
    votingInProgress: true,
    criteria: null,
    score: null,
    ...overrides,
  });
}

export const FACILITATOR: Participant = {
  participantId: FACILITATOR_ID,
  pseudo: 'eric',
  role: 'FACILITATOR',
  businessRole: 'Product Owner',
  online: true,
};

export const PARTICIPANT: Participant = {
  participantId: PARTICIPANT_ID,
  pseudo: 'alice',
  role: 'PARTICIPANT',
  businessRole: null,
  online: true,
};

export const BOB: Participant = {
  participantId: BOB_ID,
  pseudo: 'bob',
  role: 'PARTICIPANT',
  businessRole: null,
  online: true,
};

/** Un tour de vote ; par défaut ouvert sur la fonctionnalité de `feature()`, sans aucun vote. */
export function round(overrides: Partial<Round> = {}): Round {
  return {
    id: ROUND_ID,
    number: 1,
    status: 'OPEN',
    previousRoundId: null,
    featureIds: [feature().id],
    progress: [
      { participantId: FACILITATOR_ID, completedCount: 0 },
      { participantId: PARTICIPANT_ID, completedCount: 0 },
    ],
    myVotes: {},
    results: null,
    ...overrides,
  };
}

/** Les résultats d'une fonctionnalité d'un tour révélé, avec les valeurs utiles aux tests. */
export function featureResult(overrides: Partial<FeatureResult> = {}): FeatureResult {
  const empty: CriteriaValues = { bv: null, tc: null, rrOe: null, js: null };
  return {
    featureId: feature().id,
    votes: [],
    nonVoters: [],
    min: empty,
    max: empty,
    largeSpread: [],
    unanimous: empty,
    ...overrides,
  };
}

export function sessionState(overrides: Partial<SessionState> = {}): SessionState {
  const definition = overrides.methodDefinition ?? WSJF;
  return {
    type: 'sessionState',
    version: 1,
    sessionId: SESSION_ID,
    name: 'PI 27 – Epics plateforme',
    status: 'IN_PROGRESS',
    method: definition.key,
    methodVersion: definition.version,
    methodDefinition: definition,
    formula: definition.formula,
    tieBreakRule: definition.tieBreakRule,
    scale: { type: 'CONTINUOUS', max: 10, allowedValues: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
    me: { participantId: FACILITATOR_ID, pseudo: 'eric', role: 'FACILITATOR' },
    participants: [FACILITATOR, PARTICIPANT],
    features: [feature()],
    openRounds: [],
    lastRevealedRounds: [],
    ...overrides,
  };
}

/** L'état vu par un participant qui n'est pas l'animateur. */
export function participantState(overrides: Partial<SessionState> = {}): SessionState {
  return sessionState({
    me: { participantId: PARTICIPANT_ID, pseudo: 'alice', role: 'PARTICIPANT' },
    ...overrides,
  });
}
