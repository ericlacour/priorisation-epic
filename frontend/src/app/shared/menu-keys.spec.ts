import { describe, expect, it } from 'vitest';

import { menuTarget } from './menu-keys';

describe('menuTarget', () => {
  it('moves down and up with wrap-around', () => {
    expect(menuTarget('ArrowDown', 0, 4)).toBe(1);
    expect(menuTarget('ArrowDown', 3, 4)).toBe(0);
    expect(menuTarget('ArrowUp', 1, 4)).toBe(0);
    expect(menuTarget('ArrowUp', 0, 4)).toBe(3);
  });

  it('goes to the first or the last item with Home and End', () => {
    expect(menuTarget('Home', 2, 4)).toBe(0);
    expect(menuTarget('End', 0, 4)).toBe(3);
  });

  it('from the menu itself, goes to the first item down and to the last item up', () => {
    expect(menuTarget('ArrowDown', -1, 4)).toBe(0);
    expect(menuTarget('ArrowUp', -1, 4)).toBe(3);
  });

  it('ignores the other keys and an empty menu', () => {
    expect(menuTarget('Enter', 0, 4)).toBeNull();
    expect(menuTarget('ArrowDown', 0, 0)).toBeNull();
  });
});
