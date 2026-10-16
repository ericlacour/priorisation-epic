import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { REVOKE_DELAY_MS, SAVE_FILE } from './download';

describe('SAVE_FILE', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('downloads the file under its name, and frees its address only later', () => {
    vi.useFakeTimers();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fichier');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clicked: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ href: this.href, download: this.download });
    });
    const blob = new Blob(['csv']);

    TestBed.inject(SAVE_FILE)(blob, 'atelier-tableau-v1.csv');

    expect(create).toHaveBeenCalledWith(blob);
    expect(clicked).toEqual([{ href: 'blob:fichier', download: 'atelier-tableau-v1.csv' }]);
    expect(document.querySelector('a[download]')).toBeNull();
    // Firefox et Safari lisent le fichier après le clic : l'adresse reste valable un moment.
    vi.advanceTimersByTime(REVOKE_DELAY_MS - 1);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revoke).toHaveBeenCalledWith('blob:fichier');
  });
});
