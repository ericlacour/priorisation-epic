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

/** Un texte sous sa forme comparable, avec, pour chaque unité de cette forme, le caractère d'origine dont elle vient. */
export interface Folded {
  readonly text: string;
  /** `owners[i]` : indice, en caractères du texte d'origine, du caractère qui a donné l'unité `i` de `text`. */
  readonly owners: readonly number[];
}

/**
 * Forme comparable d'un texte, sans majuscules ni accents (« Épics » devient « epics »), que ses accents soient
 * précomposés (« É ») ou séparés de leur lettre (« E » suivi de l'accent, forme NFD d'un texte collé depuis macOS) : un
 * accent séparé ne laisse rien. Les positions restent rattachées aux caractères du texte d'origine.
 */
function fold(text: string): Folded {
  let folded = '';
  const owners: number[] = [];
  [...text].forEach((char, index) => {
    const piece = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    folded += piece;
    // Une entrée par unité UTF-16 de `piece`, comme les positions de `indexOf` sur `text`.
    owners.push(...Array<number>(piece.length).fill(index));
  });
  return { text: folded, owners };
}

/** Forme comparable d'un texte, sans majuscules ni accents (« Épics » devient « epics »). */
export function normalize(text: string): string {
  return fold(text).text;
}

/** Une session prête à filtrer : sa forme comparable est calculée une fois, au chargement de la liste. */
export interface PreparedSession {
  readonly session: SessionSummary;
  readonly name: Folded;
  readonly facilitatorKey: string;
}

/** Une ligne de la liste filtrée : la session et son nom découpé autour du passage trouvé. */
export interface SessionRow {
  readonly session: SessionSummary;
  readonly name: NameParts;
}

export function prepareSessions(sessions: readonly SessionSummary[]): readonly PreparedSession[] {
  return sessions.map((session) => ({
    session,
    name: fold(session.name),
    facilitatorKey: normalize(session.facilitatorPseudo),
  }));
}

/** Découpe `name` autour de la première occurrence de `needle` (déjà normalisé, non vide), ou `null`. */
function cut(name: string, folded: Folded, needle: string): NameParts | null {
  const start = folded.text.indexOf(needle);
  if (start < 0) return null;
  const chars = [...name];
  const first = folded.owners[start];
  let end = folded.owners[start + needle.length - 1] + 1;
  // Les accents séparés qui suivent le passage n'ont rien laissé dans la forme comparable : ils restent surlignés
  // avec leur lettre.
  while (end < chars.length && normalize(chars[end]) === '') end++;
  return {
    before: chars.slice(0, first).join(''),
    match: chars.slice(first, end).join(''),
    after: chars.slice(end).join(''),
  };
}

/**
 * Découpe `name` autour de la première occurrence de `query` (majuscules et accents ignorés), ou `null` si le nom ne
 * la contient pas. Une recherche vide garde le nom entier, sans passage surligné.
 */
export function matchName(name: string, query: string): NameParts | null {
  const needle = normalize(query.trim());
  if (needle === '') return { before: name, match: '', after: '' };
  return cut(name, fold(name), needle);
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

/** Les lignes des sessions qui passent les trois filtres, dans l'ordre reçu, avec le passage trouvé dans le nom. */
export function filterSessions(
  sessions: readonly PreparedSession[],
  filter: SessionFilter,
): readonly SessionRow[] {
  const facilitator = filter.facilitator === null ? null : normalize(filter.facilitator);
  const needle = normalize(filter.name.trim());
  const rows: SessionRow[] = [];
  for (const prepared of sessions) {
    const { session } = prepared;
    if (!filter.statuses.has(session.status)) continue;
    if (facilitator !== null && prepared.facilitatorKey !== facilitator) continue;
    const name =
      needle === ''
        ? { before: session.name, match: '', after: '' }
        : cut(session.name, prepared.name, needle);
    if (name !== null) rows.push({ session, name });
  }
  return rows;
}
