import { Scale } from '../api/contract';
import { MESSAGES } from '../i18n/messages.fr';

/** Valeurs autorisées d'une échelle : `allowedValues` du serveur, sinon les entiers de 1 à `max`. */
export function allowedValues(scale: Scale): readonly number[] {
  return scale.allowedValues ?? Array.from({ length: scale.max }, (_, i) => i + 1);
}

const isContiguous = (values: readonly number[]): boolean =>
  values.every((value, i) => i === 0 || value === values[i - 1] + 1);

const contiguous = isContiguous;

/**
 * Message d'une saisie de vote refusée : « BV : saisissez un nombre entier entre 1 et 10. » ou, hors suite continue,
 * « BV : valeurs autorisées : 1, 2, 3, 5. » (FR-019).
 */
export function invalidVoteMessage(code: string, values: readonly number[]): string {
  if (values.length === 0 || contiguous(values)) {
    return MESSAGES.rounds.vote.rangeError(code, values[0] ?? 1, values[values.length - 1] ?? 1);
  }
  return MESSAGES.rounds.vote.listError(code, values.join(', '));
}

/** « un nombre entier entre 1 et 10 » ou, hors suite continue, « l'une des valeurs suivantes : 1, 2, 3, 5 ». */
export function describeAllowed(values: readonly number[]): string {
  if (values.length === 0) return MESSAGES.validation.allowedRange(1, 1);
  return isContiguous(values)
    ? MESSAGES.validation.allowedRange(values[0], values[values.length - 1])
    : MESSAGES.validation.allowedList(values.join(', '));
}

/** Échelle en une ligne pour la barre de session : « Échelle 1 à 10 ». */
export function scaleLabel(scale: Scale): string {
  return scale.type === 'FIBONACCI'
    ? MESSAGES.session.scaleFibonacci(scale.max)
    : MESSAGES.session.scaleContinuous(scale.max);
}

/** Échelle pour le panneau de la méthode ; `null` : celle d'une session pas encore créée. */
export function scaleDescription(scale: Scale | null): string {
  if (scale === null) return MESSAGES.method.scaleDefault;
  return scale.type === 'FIBONACCI'
    ? MESSAGES.method.scaleFibonacci(allowedValues(scale).join(', '))
    : MESSAGES.method.scaleContinuous(scale.max);
}

export type CriterionInput =
  { readonly ok: true; readonly value: number | null } | { readonly ok: false };

/** Contrôle une saisie : vide (non saisi), ou un entier de l'échelle. Rien d'autre n'est accepté. */
export function readCriterionInput(raw: string, allowed: readonly number[]): CriterionInput {
  const text = raw.trim();
  if (text === '') return { ok: true, value: null };
  if (!/^\d+$/.test(text)) return { ok: false };
  const value = Number(text);
  return allowed.includes(value) ? { ok: true, value } : { ok: false };
}
