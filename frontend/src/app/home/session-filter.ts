import { SessionSummary } from '../api/contract';
import { SessionStatus } from '../api/session-state';

/** Statuts proposés par le filtre, dans l'ordre du cycle de vie ; tous cochés par défaut (FR-026b). */
export const ALL_STATUSES: readonly SessionStatus[] = ['PREPARATION', 'IN_PROGRESS', 'CLOSED'];

export interface SessionFilter {
  /** Texte cherché dans le nom ; vide, il ne filtre pas. */
  readonly name: string;
  /** Pseudo d'un animateur existant ; `null`, il ne filtre pas. */
  readonly facilitator: string | null;
  readonly statuses: ReadonlySet<SessionStatus>;
}

/** Un nom découpé autour du passage trouvé, pour le surligner. */
export interface NameParts {
  readonly before: string;
  readonly match: string;
  readonly after: string;
}

/**
 * Forme comparable d'un texte, sans majuscules ni accents (« Épics » devient « epics »). Chaque caractère du
 * texte d'origine donne exactement un caractère, pour que les positions restent valables dans le texte d'origine.
 */
export function normalize(text: string): string {
  return [...text]
    .map((char) => [...char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()][0] ?? char)
    .join('');
}

/**
 * Découpe `name` autour de la première occurrence de `query` (majuscules et accents ignorés), ou `null` si le nom ne
 * la contient pas. Une recherche vide garde le nom entier, sans passage surligné.
 */
export function matchName(name: string, query: string): NameParts | null {
  const needle = normalize(query.trim());
  if (needle === '') return { before: name, match: '', after: '' };
  const haystack = normalize(name);
  const start = haystack.indexOf(needle);
  if (start < 0) return null;
  // `normalize` garde un caractère pour un caractère : la position se convertit en caractères du nom d'origine.
  const chars = [...name];
  const startChar = [...haystack.slice(0, start)].length;
  const length = [...needle].length;
  return {
    before: chars.slice(0, startChar).join(''),
    match: chars.slice(startChar, startChar + length).join(''),
    after: chars.slice(startChar + length).join(''),
  };
}

/** Pseudos des animateurs des sessions, sans doublon (majuscules et accents ignorés), dans l'ordre alphabétique. */
export function facilitators(sessions: readonly SessionSummary[]): readonly string[] {
  const byKey = new Map<string, string>();
  for (const session of sessions) {
    const key = normalize(session.facilitatorPseudo);
    if (!byKey.has(key)) byKey.set(key, session.facilitatorPseudo);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}

/** Le pseudo existant qui correspond à la saisie (majuscules, accents et espaces autour ignorés), ou `null`. */
export function findFacilitator(known: readonly string[], input: string): string | null {
  const key = normalize(input.trim());
  if (key === '') return null;
  return known.find((pseudo) => normalize(pseudo) === key) ?? null;
}

/** Les sessions qui passent les trois filtres, dans l'ordre reçu. */
export function filterSessions(
  sessions: readonly SessionSummary[],
  filter: SessionFilter,
): readonly SessionSummary[] {
  const facilitator = filter.facilitator === null ? null : normalize(filter.facilitator);
  return sessions.filter(
    (session) =>
      filter.statuses.has(session.status) &&
      (facilitator === null || normalize(session.facilitatorPseudo) === facilitator) &&
      matchName(session.name, filter.name) !== null,
  );
}
