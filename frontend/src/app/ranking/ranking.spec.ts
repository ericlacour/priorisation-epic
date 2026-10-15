import { describe, expect, it } from 'vitest';

import {
  RankingStep,
  canJoinAbove,
  canMoveDown,
  canMoveUp,
  joinAbove,
  levelOf,
  levelValues,
  moveDown,
  moveTo,
  moveUp,
  newStep,
  place,
  proposedValues,
  reselect,
  resolveStep,
  setTop,
  unrank,
  withPending,
} from './ranking';

describe('ranking', () => {
  const SCALE = { type: 'CONTINUOUS', max: 10, allowedValues: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };
  const values: Record<string, number | null> = { a: 3, b: null, c: 8, d: 3, e: null };
  const start = () => newStep(['a', 'b', 'c', 'd', 'e'], (id) => values[id], SCALE);
  const resolved = (step: RankingStep) => Object.fromEntries(resolveStep(step, SCALE) ?? []);

  describe('newStep', () => {
    it('groups the features that have a value by decreasing value, and leaves the others unranked', () => {
      expect(start()).toEqual({
        levels: [['c'], ['a', 'd']],
        unranked: ['b', 'e'],
        moved: [],
        initial: values,
        top: '8',
        topTouched: false,
        overrides: {},
      });
    });

    it('starts the top value at the scale maximum when nothing has a value', () => {
      expect(newStep(['a'], () => undefined, SCALE).top).toBe('10');
    });
  });

  describe('values', () => {
    it('keeps every current value when nothing is touched', () => {
      expect(resolved(start())).toEqual({ a: 3, b: null, c: 8, d: 3, e: null });
    });

    it('gives a moved feature the value of the level it joins, or the value just below the level above', () => {
      let step = start();
      step = place(step, 'd', moveUp(step.levels, 'd'));
      expect(step.levels).toEqual([['c'], ['d'], ['a']]);
      expect(resolved(step)).toMatchObject({ c: 8, d: 7, a: 3 });

      step = place(step, 'b', joinAbove(withPending(step, 'b'), 'b'));
      expect(resolved(step)).toMatchObject({ a: 3, b: 3 });

      step = place(step, 'e', [...withPending(step, 'e')]);
      expect(step.unranked).toEqual([]);
      expect(resolved(step)).toMatchObject({ e: 2 });
    });

    it('puts a feature moved to the top ahead of the first level, not tied with it', () => {
      // Déposée tout en haut.
      let step = start();
      step = place(step, 'a', moveTo(step.levels, 'a', { before: 0 }));
      expect(resolved(step)).toMatchObject({ a: 9, c: 8, d: 3 });

      // Montée d'un cran au-dessus de la première.
      const two = newStep(['a', 'b'], (id) => ({ a: 8, b: 5 })[id], SCALE);
      expect(resolved(place(two, 'b', moveUp(two.levels, 'b')))).toEqual({ b: 9, a: 8 });

      // Sortie d'une égalité en tête.
      const tied = newStep(['a', 'b'], () => 8, SCALE);
      expect(resolved(place(tied, 'b', moveUp(tied.levels, 'b')))).toEqual({ b: 9, a: 8 });
    });

    it('pushes the levels below down when there is no room above the first one', () => {
      const fibonacci = { type: 'FIBONACCI', max: 13, allowedValues: [1, 2, 3, 5, 8, 13] };
      const step = newStep(['a', 'b'], (id) => ({ a: 13, b: 5 })[id], fibonacci);
      const moved = place(step, 'b', moveUp(step.levels, 'b'));
      expect(Object.fromEntries(resolveStep(moved, fibonacci) ?? [])).toEqual({ b: 13, a: 8 });
    });

    it('never gives a higher-ranked feature a lower value than a feature below it', () => {
      // Fibonacci, A = 13 et C = 8 : X puis Y placées chacune dans un nouveau niveau entre A et C.
      const fibonacci = { type: 'FIBONACCI', max: 13, allowedValues: [1, 2, 3, 5, 8, 13] };
      let step = newStep(['a', 'c', 'x', 'y'], (id) => ({ a: 13, c: 8 })[id] ?? null, fibonacci);
      step = place(step, 'x', moveTo(withPending(step, 'x'), 'x', { before: 1 }));
      step = place(step, 'y', moveTo(withPending(step, 'y'), 'y', { before: 2 }));
      expect(step.levels).toEqual([['a'], ['x'], ['y'], ['c']]);
      expect(levelValues(step, fibonacci)).toEqual([13, 8, 5, 3]);

      // Avec de la place entre les deux, C garde sa valeur.
      let linear = newStep(['a', 'c', 'x'], (id) => ({ a: 10, c: 5 })[id] ?? null, SCALE);
      linear = place(linear, 'x', moveTo(withPending(linear, 'x'), 'x', { before: 1 }));
      expect(resolved(linear)).toEqual({ a: 10, x: 9, c: 5 });
    });

    it('proposes a value to every level once the top value is typed', () => {
      const step = { ...start(), top: '6', topTouched: true };
      expect(resolved(step)).toEqual({ c: 6, a: 5, d: 5, b: null, e: null });
    });

    it('keeps a value typed by hand, even emptied, and refuses an invalid one', () => {
      expect(resolved({ ...start(), overrides: { c: '', b: '4' } })).toMatchObject({
        c: null,
        b: 4,
      });
      expect(resolveStep({ ...start(), overrides: { b: '0' } }, SCALE)).toBeNull();
      expect(resolveStep({ ...start(), overrides: { c: 'x' } }, SCALE)).toBeNull();
      expect(resolveStep({ ...start(), top: '' }, SCALE)).toBeNull();
      expect(levelValues({ ...start(), top: '11' }, SCALE)).toBeNull();
    });

    it('stops proposing below the smallest value of the scale', () => {
      let step = newStep(['a', 'b'], (id) => (id === 'a' ? 1 : null), SCALE);
      step = place(step, 'b', [...withPending(step, 'b')]);
      expect(resolved(step)).toEqual({ a: 1, b: null });
    });

    it('puts a feature back with the unranked ones, without value', () => {
      let step = start();
      step = place(step, 'b', [...withPending(step, 'b')]);
      step = unrank(step, 'b');
      expect(step.unranked).toEqual(['e', 'b']);
      expect(step.moved).toEqual([]);
      expect(resolved(step)).toMatchObject({ b: null });
      expect(unrank(step, 'b')).toBe(step);
      expect(place(step, 'a', step.levels)).toBe(step);
      expect(unrank(start(), 'c').levels).toEqual([['a', 'd']]);
    });
  });

  describe('setTop', () => {
    it('proposes values only when the top value really changes', () => {
      const step = start();
      expect(setTop(step, '8', SCALE).topTouched).toBe(false);
      expect(setTop(step, '6', SCALE).topTouched).toBe(true);
      expect(resolved(setTop(step, '6', SCALE))).toMatchObject({ c: 6, a: 5, d: 5 });
    });

    it('gives the current values back when the same top value is typed again', () => {
      let step = start();
      for (const text of ['', '1', '8']) step = setTop(step, text, SCALE);
      expect(step.top).toBe('8');
      expect(step.topTouched).toBe(false);
      expect(resolved(step)).toEqual({ a: 3, b: null, c: 8, d: 3, e: null });
    });

    it('compares with the current value of the first level, even after a move', () => {
      let step = start();
      step = place(step, 'a', moveTo(step.levels, 'a', { before: 0 }));
      expect(setTop(step, '9', SCALE).topTouched).toBe(false);
      expect(setTop(step, '8', SCALE).topTouched).toBe(true);
    });
  });

  describe('reselect', () => {
    it('removes the features no longer chosen and keeps the rest of the work', () => {
      let step = start();
      step = place(step, 'd', moveUp(step.levels, 'd'));
      step = { ...step, overrides: { d: '9', b: '2' } };
      const next = reselect(step, ['a', 'c', 'e'], (id) => values[id]);
      expect(next.levels).toEqual([['c'], ['a']]);
      expect(next.unranked).toEqual(['e']);
      expect(next.moved).toEqual([]);
      expect(next.overrides).toEqual({});
      expect(Object.keys(next.initial)).toEqual(['a', 'c', 'e']);
    });

    it('adds a new feature at the place of its current value, or unranked', () => {
      const step = newStep(['a', 'c'], (id) => values[id], SCALE);
      const more: Record<string, number | null> = { ...values, f: 3, g: 5, h: 1, i: null };
      const next = reselect(step, ['a', 'c', 'f', 'g', 'h', 'i'], (id) => more[id]);
      expect(next.levels).toEqual([['c'], ['g'], ['a', 'f'], ['h']]);
      expect(next.unranked).toEqual(['i']);
      expect(resolved({ ...next, top: next.top })).toMatchObject({ f: 3, g: 5, h: 1, i: null });
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
