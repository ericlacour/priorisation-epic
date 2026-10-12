import { describe, expect, it } from 'vitest';

import {
  computedDisplay,
  criterionValue,
  isMasked,
  isOutOfScale,
  missingScore,
} from './feature-cells';
import { feature, incompleteFeature, maskedFeature, outOfScaleFeature } from '../testing/fixtures';

describe('feature cells', () => {
  it('reads a retained value, null when absent or masked', () => {
    expect(criterionValue(feature(), 'bv')).toBe(8);
    expect(criterionValue(incompleteFeature(), 'tc')).toBeNull();
    expect(criterionValue(feature(), 'unknown')).toBeNull();
    expect(criterionValue(maskedFeature(), 'bv')).toBeNull();
  });

  it('reads a computed value as formatted by the server', () => {
    expect(computedDisplay(feature(), 'wsjf')).toBe('4,00');
    expect(computedDisplay(incompleteFeature(), 'wsjf')).toBeNull();
    expect(computedDisplay(maskedFeature(), 'wsjf')).toBeNull();
  });

  it('flags a criterion that is out of scale', () => {
    expect(isOutOfScale(outOfScaleFeature(), 'js')).toBe(true);
    expect(isOutOfScale(outOfScaleFeature(), 'bv')).toBe(false);
    expect(isOutOfScale(maskedFeature(), 'js')).toBe(false);
  });

  it('knows when values are masked', () => {
    expect(isMasked(maskedFeature())).toBe(true);
    expect(isMasked(feature())).toBe(false);
  });

  it('tells why a feature has no computed value', () => {
    expect(missingScore(feature())).toBeNull();
    expect(missingScore(outOfScaleFeature())).toBe('outOfScale');
    expect(missingScore(incompleteFeature())).toBe('notComputed');
    expect(missingScore(maskedFeature())).toBe('notComputed');
  });
});
