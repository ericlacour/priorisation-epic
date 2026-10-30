import { ActiveRankingRoom, CardOpinion, OpinionKind } from '../api/contract';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';

/** Symbole de chaque avis (FR-015c). */
export const OPINION_SYMBOLS: Readonly<Record<OpinionKind, string>> = {
  AGREE: '✓',
  RAISE: '↑',
  LOWER: '↓',
};

/** L'avis en clair, avec sa valeur souhaitée : « Je monterais à 8 ». */
export function opinionText(opinion: Pick<CardOpinion, 'opinion' | 'value'>): string {
  const label = MESSAGES.liveRanking.opinions[opinion.opinion];
  return opinion.value === undefined
    ? label
    : format(MESSAGES.liveRanking.wantedOpinion, { opinion: label, value: opinion.value });
}

/** Les avis de la salle sur une fonctionnalité pour le critère en cours, du plus ancien au plus récent. */
export function opinionsOf(room: ActiveRankingRoom, featureId: string): readonly CardOpinion[] {
  const criterionKey = room.draft.criterionKey;
  return room.opinions.filter(
    (opinion) => opinion.featureId === featureId && opinion.criterionKey === criterionKey,
  );
}

/** Les avis du critère en cours, par fonctionnalité. */
export function opinionsByFeature(
  room: ActiveRankingRoom,
): ReadonlyMap<string, readonly CardOpinion[]> {
  const byFeature = new Map<string, CardOpinion[]>();
  for (const opinion of room.opinions) {
    if (opinion.criterionKey !== room.draft.criterionKey) continue;
    byFeature.set(opinion.featureId, [...(byFeature.get(opinion.featureId) ?? []), opinion]);
  }
  return byFeature;
}

/** Les fonctionnalités où la salle s'est mise d'accord pour le critère en cours (FR-015c, point 5). */
export function agreedIds(room: ActiveRankingRoom): ReadonlySet<string> {
  const criterionKey = room.draft.criterionKey;
  return new Set(
    room.agreed.filter((c) => c.criterionKey === criterionKey).map((c) => c.featureId),
  );
}

/**
 * Les fonctionnalités que la salle voudrait monter ou descendre pour le critère en cours, de la plus demandée à la
 * moins demandée (à égalité, dans l'ordre du brouillon).
 */
export function cardsToMove(room: ActiveRankingRoom): readonly string[] {
  const order = [...room.draft.levels.flat(), ...room.draft.unranked];
  const moves = (id: string) =>
    opinionsOf(room, id).filter((opinion) => opinion.opinion !== 'AGREE').length;
  return order.filter((id) => moves(id) > 0).sort((a, b) => moves(b) - moves(a));
}

/** La valeur au-dessus (`RAISE`) ou au-dessous (`LOWER`) de `value` sur l'échelle ; `null` s'il n'y en a pas. */
export function nextValue(
  allowed: readonly number[],
  value: number | null,
  kind: 'RAISE' | 'LOWER',
): number | null {
  if (value === null) return null;
  if (kind === 'RAISE') return allowed.find((v) => v > value) ?? null;
  return [...allowed].reverse().find((v) => v < value) ?? null;
}

/** Les valeurs qu'un participant peut demander : au-dessus pour monter, au-dessous pour descendre (toutes sans valeur). */
export function wantedChoices(
  allowed: readonly number[],
  value: number | null,
  kind: 'RAISE' | 'LOWER',
): readonly number[] {
  if (value === null) return allowed;
  return allowed.filter((v) => (kind === 'RAISE' ? v > value : v < value));
}

/** La valeur proposée d'emblée à un participant qui monte ou descend une carte : le cran suivant de l'échelle. */
export function defaultWanted(
  allowed: readonly number[],
  value: number | null,
  kind: 'RAISE' | 'LOWER',
): number | undefined {
  const choices = wantedChoices(allowed, value, kind);
  if (value === null) return kind === 'RAISE' ? choices[choices.length - 1] : choices[0];
  return nextValue(allowed, value, kind) ?? undefined;
}

/**
 * L'écart d'avis sur une fonctionnalité pour le critère en cours (FR-015c) : `low` et `high` bornent la valeur du
 * brouillon et les valeurs demandées (un ↑ ou ↓ sans valeur compte pour le cran suivant), `steps` compte les crans de
 * l'échelle qui les séparent. `opposed` : la salle demande à la fois de monter et de descendre la carte.
 */
export interface OpinionGap {
  readonly low: number;
  readonly high: number;
  readonly steps: number;
  readonly opposed: boolean;
  readonly level: 'strong' | 'notable' | null;
}

/** À partir de combien de crans d'écart une carte est signalée, puis signalée comme un fort écart. */
export const NOTABLE_GAP_STEPS = 2;
export const STRONG_GAP_STEPS = 3;

/** L'écart d'avis sur une fonctionnalité ; `null` sans valeur du brouillon ni valeur demandée. */
export function opinionGap(
  room: ActiveRankingRoom,
  featureId: string,
  allowed: readonly number[],
): OpinionGap | null {
  const current = room.draft.values[featureId] ?? null;
  const opinions = opinionsOf(room, featureId);
  const values = [
    current,
    ...opinions.map((opinion) =>
      opinion.opinion === 'AGREE'
        ? current
        : (opinion.value ?? nextValue(allowed, current, opinion.opinion)),
    ),
  ].filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const steps = allowed.filter((v) => v > low && v <= high).length;
  const kinds = new Set(opinions.map((opinion) => opinion.opinion));
  const opposed = kinds.has('RAISE') && kinds.has('LOWER');
  const level =
    steps >= STRONG_GAP_STEPS || opposed ? 'strong' : steps >= NOTABLE_GAP_STEPS ? 'notable' : null;
  return { low, high, steps, opposed, level };
}

/**
 * Les gros écarts du critère en cours, par fonctionnalité (FR-015c) : seulement les cartes signalées, sauf celles
 * dont la discussion est terminée (`room.discussed`, que le serveur oublie dès qu'un avis sur la carte change).
 */
export function roomGaps(
  room: ActiveRankingRoom,
  allowed: readonly number[],
): ReadonlyMap<string, OpinionGap> {
  const criterionKey = room.draft.criterionKey;
  const discussed = new Set(
    room.discussed.filter((c) => c.criterionKey === criterionKey).map((c) => c.featureId),
  );
  const gaps = new Map<string, OpinionGap>();
  for (const id of new Set(room.opinions.map((o) => o.featureId))) {
    const gap = opinionGap(room, id, allowed);
    if (gap?.level && !discussed.has(id)) gaps.set(id, gap);
  }
  return gaps;
}
