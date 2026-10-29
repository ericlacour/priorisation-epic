import { ActiveRankingRoom, CardOpinion, OpinionKind } from '../api/contract';

/** Symbole de chaque avis (FR-015c). */
export const OPINION_SYMBOLS: Readonly<Record<OpinionKind, string>> = {
  AGREE: '✓',
  RAISE: '↑',
  LOWER: '↓',
};

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
