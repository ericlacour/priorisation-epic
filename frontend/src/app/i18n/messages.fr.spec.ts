import { describe, expect, it } from 'vitest';

import errorSchema from '../../../../contract/schemas/error.json';
import { ERROR_CODES } from '../api/contract';
import { MESSAGES } from './messages.fr';

/**
 * Une consigne : un verbe à l'impératif (« Choisissez », « réessayez »…) ou une règle à respecter
 * (« doit », « doivent »).
 */
const INSTRUCTION = /(^|[^\p{L}])(\p{L}{3,}ez|doit|doivent)(?!\p{L})/iu;

/** Le catalogue des textes (T118, FR-027, constitution V). */
describe('MESSAGES', () => {
  it('knows every error code of the contract', () => {
    expect([...ERROR_CODES].sort()).toEqual([...errorSchema.properties.code.enum].sort());
    for (const code of ERROR_CODES) expect(MESSAGES.intentErrors[code]).toBeTruthy();
  });

  it('says how to fix every error', () => {
    const errors: Record<string, string> = {
      ...MESSAGES.intentErrors,
      ...Object.fromEntries(
        Object.entries(MESSAGES.apiErrors).map(([key, text]) => [`apiErrors.${key}`, text]),
      ),
      ...Object.fromEntries(
        Object.entries(MESSAGES.importDialog.errors).map(([key, text]) => [
          `importDialog.errors.${key}`,
          text,
        ]),
      ),
    };
    const vague = Object.entries(errors).filter(([, text]) => !INSTRUCTION.test(text));
    expect(vague).toEqual([]);
  });
});
