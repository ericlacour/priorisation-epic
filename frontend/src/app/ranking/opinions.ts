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

/** La valeur de l'échelle la plus proche de `value` ; à égale distance, la plus forte. */
function nearest(allowed: readonly number[], value: number): number {
  return allowed.reduce((best, v) => (Math.abs(v - value) <= Math.abs(best - value) ? v : best));
}

/**
 * La valeur d'une fonctionnalité selon la salle : la moyenne des avis, ramenée à la valeur la plus proche de l'échelle.
 * « D'accord » compte pour la valeur du brouillon ; « Je monterais » ou « Je descendrais » pour la valeur demandée, ou
 * à défaut le cran suivant de l'échelle. Sans avis, la valeur du brouillon reste.
 */
export function roomValue(
  room: ActiveRankingRoom,
  featureId: string,
  allowed: readonly number[],
): number | null {
  const current = room.draft.values[featureId] ?? null;
  const wanted = opinionsOf(room, featureId)
    .map((opinion) =>
      opinion.opinion === 'AGREE'
        ? current
        : (opinion.value ?? nextValue(allowed, current, opinion.opinion)),
    )
    .filter((value): value is number => value !== null);
  if (wanted.length === 0 || allowed.length === 0) return current;
  return nearest(allowed, wanted.reduce((sum, v) => sum + v, 0) / wanted.length);
}

/** Une fonctionnalité dans le classement selon la salle : sa valeur dans le brouillon et selon la salle. */
export interface RoomEntry {
  readonly id: string;
  readonly current: number | null;
  readonly value: number | null;
}

/** Le classement selon la salle : niveaux de valeur décroissante (ordre du brouillon à égalité), puis les sans valeur. */
export function roomRanking(
  room: ActiveRankingRoom,
  allowed: readonly number[],
): { readonly levels: readonly (readonly RoomEntry[])[]; readonly unranked: readonly RoomEntry[] } {
  const entries = [...room.draft.levels.flat(), ...room.draft.unranked].map((id) => ({
    id,
    current: room.draft.values[id] ?? null,
    value: roomValue(room, id, allowed),
  }));
  const values = [...new Set(entries.map((e) => e.value).filter((v): v is number => v !== null))];
  return {
    levels: values.sort((a, b) => b - a).map((v) => entries.filter((e) => e.value === v)),
    unranked: entries.filter((e) => e.value === null),
  };
}
