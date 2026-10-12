import { describe, expect, it } from 'vitest';

import { Scale } from '../api/contract';
import {
  allowedValues,
  describeAllowed,
  readCriterionInput,
  scaleDescription,
  scaleLabel,
} from './method-format';

const continuous: Scale = { type: 'CONTINUOUS', max: 5 };
const fibonacci: Scale = { type: 'FIBONACCI', max: 13, allowedValues: [1, 2, 3, 5, 8, 13] };

describe('allowedValues', () => {
  it('uses the values sent by the server', () => {
    expect(allowedValues(fibonacci)).toEqual([1, 2, 3, 5, 8, 13]);
  });

  it('falls back to the integers from 1 to max', () => {
    expect(allowedValues(continuous)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('describeAllowed', () => {
  it('describes a continuous range', () => {
    expect(describeAllowed([1, 2, 3, 4, 5])).toBe('un nombre entier entre 1 et 5');
  });

  it('lists the values of a sequence with gaps', () => {
    expect(describeAllowed([1, 2, 3, 5, 8])).toBe("l'une des valeurs suivantes : 1, 2, 3, 5, 8");
  });

  it('copes with an empty list', () => {
    expect(describeAllowed([])).toBe('un nombre entier entre 1 et 1');
  });
});

describe('scale labels', () => {
  it('labels both scale types for the session bar', () => {
    expect(scaleLabel(continuous)).toBe('Échelle 1 à 5');
    expect(scaleLabel(fibonacci)).toBe("Échelle de Fibonacci jusqu'à 13");
  });

  it('describes the scale for the method panel', () => {
    expect(scaleDescription(continuous)).toBe('entiers de 1 à 5');
    expect(scaleDescription(fibonacci)).toBe('suite de Fibonacci (1, 2, 3, 5, 8, 13)');
  });

  it('describes the default scale before a session exists', () => {
    expect(scaleDescription(null)).toBe('entiers de 1 à 10 par défaut, réglable après la création');
  });
});

describe('readCriterionInput', () => {
  const allowed = [1, 2, 3, 5, 8];

  it('treats an empty or blank input as not entered', () => {
    expect(readCriterionInput('', allowed)).toEqual({ ok: true, value: null });
    expect(readCriterionInput('   ', allowed)).toEqual({ ok: true, value: null });
  });

  it('accepts an allowed integer, ignoring surrounding spaces', () => {
    expect(readCriterionInput(' 5 ', allowed)).toEqual({ ok: true, value: 5 });
  });

  it.each(['0', '4', '13', '2,5', '2.5', '-1', 'abc', '1e1', '+2'])('refuses %s', (raw) => {
    expect(readCriterionInput(raw, allowed)).toEqual({ ok: false });
  });
});
