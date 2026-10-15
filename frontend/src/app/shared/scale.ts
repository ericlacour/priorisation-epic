import { ScaleType } from '../api/contract';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';

/** La suite de Fibonacci SAFe (FR-010). */
export const FIBONACCI_VALUES: readonly number[] = [1, 2, 3, 5, 8, 13, 20, 40, 100];

/** Les bornes possibles d'une échelle de Fibonacci : les valeurs de la suite à partir de 2. */
export const FIBONACCI_BOUNDS: readonly number[] = FIBONACCI_VALUES.slice(1);

/** Bornes d'une échelle continue. */
export const CONTINUOUS_MIN_MAX = 2;
export const CONTINUOUS_MAX_MAX = 100;

/** La borne par défaut d'un type : 10 en continu, 20 en Fibonacci. */
export const defaultMax = (type: ScaleType): number => (type === 'FIBONACCI' ? 20 : 10);

/**
 * Les valeurs d'une échelle demandée, pour les montrer avant de l'appliquer. Le serveur reste seul juge : l'état
 * reçu porte les `allowedValues` de l'échelle en vigueur.
 */
export function allowedValuesOf(type: ScaleType, max: number): number[] {
  if (type === 'FIBONACCI') return FIBONACCI_VALUES.filter((value) => value <= max);
  return Array.from({ length: Math.max(max, 0) }, (_, i) => i + 1);
}

/** Vrai si la borne est permise pour ce type. */
export function isValidMax(type: ScaleType, max: number): boolean {
  if (!Number.isInteger(max)) return false;
  return type === 'FIBONACCI'
    ? FIBONACCI_BOUNDS.includes(max)
    : max >= CONTINUOUS_MIN_MAX && max <= CONTINUOUS_MAX_MAX;
}

/** L'échelle en clair : « 1 à 10 », ou « Fibonacci 1, 2, 3, 5, 8, 13 ». */
export function scaleLabel(scale: {
  readonly type: string;
  readonly max: number;
  readonly allowedValues: readonly number[];
}): string {
  return scale.type === 'FIBONACCI'
    ? format(MESSAGES.scale.fibonacciLabel, { values: scale.allowedValues.join(', ') })
    : format(MESSAGES.scale.continuousLabel, { max: scale.max });
}

/** Le message d'une valeur refusée : l'intervalle en continu, la liste des valeurs en Fibonacci. */
export function invalidValueMessage(
  code: string,
  scale: { readonly type: string; readonly max: number; readonly allowedValues: readonly number[] },
): string {
  return scale.type === 'FIBONACCI'
    ? format(MESSAGES.editor.valueInvalidList, {
        code,
        values: scale.allowedValues.join(', '),
      })
    : format(MESSAGES.editor.valueInvalid, { code, max: scale.max });
}
