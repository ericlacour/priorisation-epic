import { describe, expect, it } from 'vitest';

import {
  canJoinAbove,
  canMoveDown,
  canMoveUp,
  initialLevels,
  joinAbove,
  levelOf,
  moveDown,
  moveTo,
  moveUp,
  proposedValues,
} from './ranking';

describe('ranking', () => {
  describe('initialLevels', () => {
    it('groups the features that have a value by decreasing value, then each other one alone, in order', () => {
      const values: Record<string, number | null> = { a: 3, b: null, c: 8, d: 3, e: null };
      expect(initialLevels(['a', 'b', 'c', 'd', 'e'], (id) => values[id])).toEqual([
        ['c'],
        ['a', 'd'],
        ['b'],
        ['e'],
      ]);
    });

    it('treats an unknown value as no value', () => {
      expect(initialLevels(['a', 'b'], () => undefined)).toEqual([['a'], ['b']]);
    });
  });

  describe('moves', () => {
    const levels = [['a'], ['b', 'c'], ['d']];

    it('finds the level of a feature', () => {
      expect(levelOf(levels, 'c')).toBe(1);
      expect(levelOf(levels, 'x')).toBe(-1);
    });

    it('moves a feature alone above the previous level, and a tied one out above its group', () => {
      expect(moveUp(levels, 'd')).toEqual([['a'], ['d'], ['b', 'c']]);
      expect(moveUp(levels, 'c')).toEqual([['a'], ['c'], ['b'], ['d']]);
      expect(moveUp([['a', 'b']], 'b')).toEqual([['b'], ['a']]);
      expect(moveUp(levels, 'a')).toBe(levels);
      expect(moveUp(levels, 'x')).toBe(levels);
    });

    it('moves a feature alone below the next level, and a tied one out below its group', () => {
      expect(moveDown(levels, 'a')).toEqual([['b', 'c'], ['a'], ['d']]);
      expect(moveDown(levels, 'b')).toEqual([['a'], ['c'], ['b'], ['d']]);
      expect(moveDown([['a', 'b']], 'a')).toEqual([['b'], ['a']]);
      expect(moveDown(levels, 'd')).toBe(levels);
      expect(moveDown(levels, 'x')).toBe(levels);
    });

    it('ties a feature with the level above, and removes the level it leaves empty', () => {
      expect(joinAbove(levels, 'd')).toEqual([['a'], ['b', 'c', 'd']]);
      expect(joinAbove(levels, 'b')).toEqual([['a', 'b'], ['c'], ['d']]);
      expect(joinAbove(levels, 'a')).toBe(levels);
    });

    it('drops a feature into a level or into a new level, with positions taken before the move', () => {
      expect(moveTo(levels, 'a', { into: 2 })).toEqual([
        ['b', 'c'],
        ['d', 'a'],
      ]);
      expect(moveTo(levels, 'd', { before: 0 })).toEqual([['d'], ['a'], ['b', 'c']]);
      expect(moveTo(levels, 'a', { before: 3 })).toEqual([['b', 'c'], ['d'], ['a']]);
      expect(moveTo(levels, 'b', { before: 99 })).toEqual([['a'], ['c'], ['d'], ['b']]);
      expect(moveTo(levels, 'b', { into: 1 })).toBe(levels);
      expect(moveTo(levels, 'b', { into: 9 })).toBe(levels);
      expect(moveTo(levels, 'x', { into: 0 })).toBe(levels);
    });

    it('tells which moves are possible', () => {
      expect([
        canMoveUp(levels, 'a'),
        canMoveUp(levels, 'b'),
        canMoveUp([['a', 'b']], 'a'),
      ]).toEqual([false, true, true]);
      expect([
        canMoveDown(levels, 'd'),
        canMoveDown(levels, 'a'),
        canMoveDown(levels, 'x'),
      ]).toEqual([false, true, false]);
      expect([canMoveDown([['a'], ['b', 'c']], 'c')]).toEqual([true]);
      expect([canJoinAbove(levels, 'a'), canJoinAbove(levels, 'd')]).toEqual([false, true]);
    });
  });

  describe('proposedValues', () => {
    it('proposes the top value, then the value just below on the scale for each level', () => {
      expect(proposedValues(3, 8, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual([8, 7, 6]);
    });

    it('proposes nothing once the scale runs out', () => {
      expect(proposedValues(4, 2, [1, 2, 3])).toEqual([2, 1, null, null]);
    });

    it('follows a scale with gaps, such as Fibonacci', () => {
      expect(proposedValues(3, 13, [1, 2, 3, 5, 8, 13, 20])).toEqual([13, 8, 5]);
    });
  });
});
