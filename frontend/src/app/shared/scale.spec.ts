import { describe, expect, it } from 'vitest';

import { allowedValuesOf, defaultMax, invalidValueMessage, isValidMax, scaleLabel } from './scale';

describe('scale', () => {
  it('lists the allowed values of a continuous or Fibonacci scale', () => {
    expect(allowedValuesOf('CONTINUOUS', 3)).toEqual([1, 2, 3]);
    expect(allowedValuesOf('FIBONACCI', 13)).toEqual([1, 2, 3, 5, 8, 13]);
    expect(allowedValuesOf('FIBONACCI', 100)).toEqual([1, 2, 3, 5, 8, 13, 20, 40, 100]);
  });

  it('checks the bound of each type', () => {
    expect(isValidMax('CONTINUOUS', 2)).toBe(true);
    expect(isValidMax('CONTINUOUS', 100)).toBe(true);
    expect(isValidMax('CONTINUOUS', 1)).toBe(false);
    expect(isValidMax('CONTINUOUS', 101)).toBe(false);
    expect(isValidMax('CONTINUOUS', 2.5)).toBe(false);
    expect(isValidMax('FIBONACCI', 13)).toBe(true);
    expect(isValidMax('FIBONACCI', 10)).toBe(false);
    expect(isValidMax('FIBONACCI', 1)).toBe(false);
  });

  it('defaults to 10 in continuous and 20 in Fibonacci', () => {
    expect(defaultMax('CONTINUOUS')).toBe(10);
    expect(defaultMax('FIBONACCI')).toBe(20);
  });

  it('describes the scale and its refused values in French', () => {
    const continuous = {
      type: 'CONTINUOUS',
      max: 10,
      allowedValues: allowedValuesOf('CONTINUOUS', 10),
    };
    const fibonacci = {
      type: 'FIBONACCI',
      max: 13,
      allowedValues: allowedValuesOf('FIBONACCI', 13),
    };
    expect(scaleLabel(continuous)).toBe('1 à 10');
    expect(scaleLabel(fibonacci)).toBe('Fibonacci 1, 2, 3, 5, 8, 13');
    expect(invalidValueMessage('BV', continuous)).toBe(
      'BV doit être un entier entre 1 et 10, ou rester vide.',
    );
    expect(invalidValueMessage('BV', fibonacci)).toBe(
      'BV doit être l’une des valeurs 1, 2, 3, 5, 8, 13, ou rester vide.',
    );
  });
});
