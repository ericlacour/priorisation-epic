import { SESSION_ID } from './fake-session-socket';

/** Définition du WSJF telle que le serveur l'envoie (data-model.md). */
export const WSJF = {
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
      definition: 'CoD / JS ; plus il est élevé, plus la fonctionnalité est prioritaire.',
      header: 'WSJF',
      display: 'DECIMAL_2',
    },
  ],
  formula: 'CoD = BV + TC + RR/OE ; WSJF = CoD / JS',
  tieBreakRule:
    'WSJF décroissant, puis CoD décroissant, puis identifiant croissant (sans tenir compte de la casse). Les fonctionnalités incomplètes ou hors échelle viennent en fin de tableau, par identifiant croissant.',
};

export interface FeatureOptions {
  id: string;
  externalId: string;
  title?: string;
  version?: number;
  criteria?: Record<string, number | null>;
  /** Valeurs calculées déjà formatées : `[cod, wsjf, explication]`, absentes si la fonctionnalité est incomplète. */
  computed?: [string, string, string];
  rank?: number;
  description?: string | null;
  markedForReview?: boolean;
}

export function feature(options: FeatureOptions) {
  return {
    id: options.id,
    externalId: options.externalId,
    title: options.title ?? `Titre ${options.externalId}`,
    description: options.description ?? null,
    version: options.version ?? 0,
    markedForReview: options.markedForReview ?? false,
    reviewReason: null,
    votingInProgress: false,
    criteria: options.criteria ?? {},
    score: options.computed
      ? {
          complete: true,
          outOfScale: [],
          computed: {
            cod: { numerator: 1, denominator: 1, display: options.computed[0] },
            wsjf: { numerator: 1, denominator: 1, display: options.computed[1] },
          },
          explanation: options.computed[2],
          rank: options.rank ?? 1,
        }
      : { complete: false, outOfScale: [], computed: null, explanation: null, rank: null },
  };
}

export const F1 = feature({
  id: '11111111-1111-4111-8111-111111111111',
  externalId: 'F-1',
  title: 'Paiement en un clic',
  description: 'Permettre le paiement sans ressaisir la carte.',
  version: 1,
  criteria: { bv: 8, tc: 5, rrOe: 3, js: 4 },
  computed: ['16', '4,00', 'CoD = 8 + 5 + 3 = 16 ; WSJF = 16 / 4 = 4,00'],
  rank: 1,
});

export const F2 = feature({
  id: '22222222-2222-4222-8222-222222222222',
  externalId: 'F-2',
  title: 'Notifications de livraison',
  criteria: { bv: 2, tc: 2, rrOe: 2, js: 3 },
  computed: ['6', '2,00', 'CoD = 2 + 2 + 2 = 6 ; WSJF = 6 / 3 = 2,00'],
  rank: 2,
});

export const F3 = feature({
  id: '33333333-3333-4333-8333-333333333333',
  externalId: 'F-3',
  title: 'Programme de fidélité',
  criteria: { bv: 6 },
});

export function sessionState(
  features: unknown[],
  options: { animate: boolean; version?: number } = { animate: true },
) {
  return {
    type: 'sessionState',
    version: options.version ?? 1,
    sessionId: SESSION_ID,
    name: 'Atelier Q4',
    status: 'PREPARATION',
    method: 'WSJF',
    methodVersion: 1,
    methodDefinition: WSJF,
    formula: WSJF.formula,
    tieBreakRule: WSJF.tieBreakRule,
    scale: { type: 'CONTINUOUS', max: 10, allowedValues: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
    me: {
      participantId: 'p-me',
      pseudo: 'Éric',
      role: options.animate ? 'FACILITATOR' : 'PARTICIPANT',
    },
    participants: [
      {
        participantId: 'p-fac',
        pseudo: 'Éric',
        role: 'FACILITATOR',
        businessRole: null,
        online: true,
      },
      {
        participantId: 'p-bob',
        pseudo: 'Bob',
        role: 'PARTICIPANT',
        businessRole: null,
        online: false,
      },
    ],
    features,
  };
}

/** Beaucoup de fonctionnalités complètes, pour vérifier que seule la liste défile. */
export function manyFeatures(count: number): unknown[] {
  return Array.from({ length: count }, (_, index) =>
    feature({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      externalId: `F-${index + 1}`,
      title: `Fonctionnalité numéro ${index + 1} avec un titre assez long pour être tronqué dans la colonne du tableau`,
      criteria: { bv: 5, tc: 5, rrOe: 5, js: 5 },
      computed: ['15', '3,00', 'CoD = 5 + 5 + 5 = 15 ; WSJF = 15 / 5 = 3,00'],
      rank: index + 1,
    }),
  );
}
