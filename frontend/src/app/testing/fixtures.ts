import { ActiveRankingRoom } from '../api/contract';
import { Feature, MethodDefinition, Participant, Score, SessionState } from '../api/session-state';

/** Données de test partagées par les specs (exclues de la couverture). */
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
      definition: 'Valeur apportée aux utilisateurs ou au business.',
      header: 'BV',
    },
    {
      key: 'tc',
      code: 'TC',
      label: 'Time Criticality',
      definition: 'Importance de réaliser rapidement la fonctionnalité.',
      header: 'TC',
    },
    {
      key: 'rrOe',
      code: 'RR/OE',
      label: 'Risk Reduction / Opportunity Enablement',
      definition: 'Capacité à réduire un risque ou à permettre une opportunité.',
      header: 'RR/OE',
    },
    {
      key: 'js',
      code: 'JS',
      label: 'Job Size',
      definition:
        'Taille relative du travail nécessaire : plus le JS est grand, plus le travail est long et compliqué, et plus le WSJF baisse.',
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
      definition: 'CoD / JS ; plus il est élevé, plus la fonctionnalité est prioritaire.',
      header: 'WSJF',
      display: 'DECIMAL_2',
    },
  ],
  formula: 'CoD = BV + TC + RR/OE ; WSJF = CoD / JS',
  tieBreakRule:
    'WSJF décroissant, puis CoD décroissant, puis identifiant croissant (sans tenir compte de la casse). Les fonctionnalités incomplètes ou hors échelle viennent en fin de tableau, par identifiant croissant.',
};

/** Méthode fictive à deux critères : le front n'a aucun code propre au WSJF (SC-009). */
export const TWO_CRITERIA: MethodDefinition = {
  key: 'REACH',
  version: 1,
  name: 'Reach / Effort',
  criteria: [
    {
      key: 'reach',
      code: 'Reach',
      label: 'Reach',
      definition: 'Nombre de personnes touchées.',
      header: 'Reach',
    },
    {
      key: 'effort',
      code: 'Effort',
      label: 'Effort',
      definition: 'Effort nécessaire.',
      header: 'Effort',
    },
  ],
  computedValues: [
    {
      key: 'ratio',
      code: 'Ratio',
      label: 'Reach / Effort',
      definition: 'Reach divisé par Effort.',
      header: 'Ratio',
      display: 'DECIMAL_2',
    },
  ],
  formula: 'Ratio = Reach / Effort',
  tieBreakRule: 'Ratio décroissant, puis identifiant croissant.',
};

export function completeScore(
  rank: number,
  computed: Record<string, string>,
  explanation: string,
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
    explanation,
    rank,
  };
}

export const INCOMPLETE: Score = {
  complete: false,
  outOfScale: [],
  computed: null,
  explanation: null,
  rank: null,
};

export function feature(overrides: Partial<Feature> & { id: string; externalId: string }): Feature {
  return {
    title: `Titre ${overrides.externalId}`,
    description: null,
    version: 0,
    markedForReview: false,
    reviewReason: null,
    votingInProgress: false,
    criteria: {},
    score: INCOMPLETE,
    ...overrides,
  };
}

export const F1 = feature({
  id: 'f1',
  externalId: 'F-1',
  title: 'Paiement en un clic',
  description: 'Permettre le paiement sans ressaisir la carte.\nSecond paragraphe.',
  version: 2,
  criteria: { bv: 8, tc: 5, rrOe: 3, js: 4 },
  score: completeScore(
    1,
    { cod: '16', wsjf: '4,00' },
    'CoD = 8 + 5 + 3 = 16 ; WSJF = 16 / 4 = 4,00',
  ),
});

export const F2 = feature({
  id: 'f2',
  externalId: 'F-2',
  title: 'Export comptable',
  criteria: { bv: 3 },
  score: INCOMPLETE,
});

export const PEOPLE: Participant[] = [
  { participantId: 'p1', pseudo: 'Éric', role: 'FACILITATOR', businessRole: null, online: true },
  {
    participantId: 'p2',
    pseudo: 'Camille',
    role: 'PARTICIPANT',
    businessRole: 'PO',
    online: false,
  },
];

export function state(overrides: Partial<SessionState> = {}): SessionState {
  const methodDefinition = overrides.methodDefinition ?? WSJF;
  return {
    type: 'sessionState',
    version: 1,
    sessionId: SESSION_ID,
    name: 'Atelier Q4',
    status: 'PREPARATION',
    method: methodDefinition.key,
    methodVersion: methodDefinition.version,
    methodDefinition,
    formula: methodDefinition.formula,
    tieBreakRule: methodDefinition.tieBreakRule,
    scale: {
      type: 'CONTINUOUS',
      max: 10,
      allowedValues: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    },
    me: { participantId: 'p1', pseudo: 'Éric', role: 'FACILITATOR' },
    participants: PEOPLE,
    features: [F1, F2],
    ...overrides,
  };
}

/** Une salle de classement ouverte par Éric : BV, F-1 au niveau 1 (8), F-2 non classée. */
export function rankingRoom(overrides: Partial<ActiveRankingRoom> = {}): ActiveRankingRoom {
  return {
    type: 'rankingRoom',
    active: true,
    facilitatorId: 'p1',
    live: true,
    draft: {
      criterionKeys: ['bv', 'js'],
      criterionKey: 'bv',
      levels: [['f1']],
      unranked: ['f2'],
      values: { f1: 8 },
    },
    opinions: [],
    spotlightFeatureId: null,
    discussed: [],
    agreed: [],
    ...overrides,
  };
}
