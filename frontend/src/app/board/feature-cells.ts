import { Feature } from '../api/contract';

/** Valeur retenue d'un critère, `null` si non saisie ou masquée. */
export const criterionValue = (feature: Feature, key: string): number | null =>
  feature.criteria?.[key] ?? null;

/** Valeur calculée déjà formatée par le serveur (`display`), `null` tant que la fonctionnalité n'est pas calculée. */
export const computedDisplay = (feature: Feature, key: string): string | null =>
  feature.score?.computed?.[key]?.display ?? null;

/** Vrai quand la valeur saisie de ce critère sort de l'échelle (FR-011). */
export const isOutOfScale = (feature: Feature, key: string): boolean =>
  feature.score?.outOfScale.includes(key) ?? false;

/** Vrai quand les valeurs sont masquées (tour de vote ouvert, FR-019a). */
export const isMasked = (feature: Feature): boolean => feature.criteria === null;

/** État affiché à la place des valeurs calculées : `outOfScale`, `notComputed`, ou `null` si elles existent. */
export function missingScore(feature: Feature): 'outOfScale' | 'notComputed' | null {
  if (feature.score?.computed) return null;
  return (feature.score?.outOfScale.length ?? 0) > 0 ? 'outOfScale' : 'notComputed';
}
