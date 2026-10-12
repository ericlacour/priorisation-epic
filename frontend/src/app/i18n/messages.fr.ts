/**
 * Catalogue des textes d'interface, en français (constitution V, research R13).
 *
 * Il ne contient pas les sigles, noms et définitions des critères : ils viennent de
 * `methodDefinition` (FR-016a, FR-017b).
 */
export const MESSAGES = {
  app: {
    name: 'Priorisation Fonctionnalités',
    badge: 'PF',
  },
  layout: {
    readOnlyBanner: 'Pour voter ou modifier, utilisez un ordinateur',
  },
  topBar: {
    themeMenu: 'Thème',
    themeMenuLabel: "Menu d'affichage : thème",
    themeAuto: 'Automatique',
    themeLight: 'Clair',
    themeDark: 'Sombre',
  },
  wake: {
    waking: 'Réveil du service…',
    wakingLead: "Ça peut prendre jusqu'à 2 minutes.",
    unavailable: 'Le service ne répond pas.',
    retry: 'Réessayer',
  },
  home: {
    title: 'Priorisation Fonctionnalités',
    lead: 'Priorisez vos fonctionnalités en équipe, avec la méthode WSJF.',
  },
  sessionEntry: {
    title: 'Session',
  },
  animate: {
    title: 'Animation de la session',
  },
  connection: {
    reconnecting: 'Reconnexion…',
  },
} as const;

export type Messages = typeof MESSAGES;
