/**
 * Catalogue des textes d'interface, en français (constitution V, research R13).
 *
 * Il ne contient pas les sigles, noms et définitions des critères : ils viennent de
 * `methodDefinition` (FR-016a, FR-017b).
 */
export const MESSAGES = {
  app: {
    name: 'Priorisation epic',
  },
  layout: {
    readOnlyBanner: 'Pour voter ou modifier, utilisez un ordinateur',
  },
} as const;

export type Messages = typeof MESSAGES;
