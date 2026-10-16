import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExportFormat, ExportedFile, SessionApi, SessionApiError } from '../api/session-api';
import { CLIPBOARD_HTML } from '../shared/clipboard';
import { SAVE_FILE } from '../shared/download';
import { SESSION_ID } from '../testing/fixtures';
import { EXPORT_NOTICE_MS, ExportMenuComponent } from './export-menu.component';

const FILES: Record<ExportFormat, ExportedFile> = {
  csv: { blob: new Blob(['csv']), fileName: 'atelier-tableau-v1.csv' },
  'confluence-wiki': { blob: new Blob(['wiki']), fileName: 'atelier-confluence-v1.txt' },
  'confluence-html': {
    blob: new Blob(['<table></table>'], { type: 'text/html' }),
    fileName: 'atelier-confluence-v1.html',
  },
  json: { blob: new Blob(['{}']), fileName: 'atelier-session-v1.json' },
};

describe('ExportMenuComponent', () => {
  afterEach(() => vi.useRealTimers());

  function render(
    options: {
      exportFile?: (id: string, format: ExportFormat) => Promise<ExportedFile>;
      copy?: (html: Promise<string>) => Promise<void>;
    } = {},
  ) {
    const exportFile = vi.fn(options.exportFile ?? (async (_id, format) => FILES[format]));
    const saveFile = vi.fn();
    const copied: string[] = [];
    const copy = vi.fn(
      options.copy ??
        (async (html: Promise<string>) => {
          copied.push(await html);
        }),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: SessionApi, useValue: { exportFile } },
        { provide: SAVE_FILE, useValue: saveFile },
        { provide: CLIPBOARD_HTML, useValue: copy },
      ],
    });
    const fixture = TestBed.createComponent(ExportMenuComponent);
    fixture.componentRef.setInput('sessionId', SESSION_ID);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const trigger = element.querySelector('button') as HTMLButtonElement;
    const open = async () => {
      trigger.click();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const items = () => [...element.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    const choose = async (id: string) => {
      await open();
      element.querySelector<HTMLButtonElement>(`[data-export="${id}"]`)!.click();
      // L'export est fini quand son résultat s'annonce.
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(element.querySelector('.export-notice')).not.toBeNull();
      });
      expect(trigger.getAttribute('aria-busy')).toBe('false');
    };
    const notice = () => element.querySelector<HTMLElement>('.export-notice');
    return {
      fixture,
      element,
      trigger,
      open,
      items,
      choose,
      notice,
      exportFile,
      saveFile,
      copy,
      copied,
    };
  }

  it('offers the board CSV, the Confluence copy, the wiki markup and the JSON, with their versions', async () => {
    const { trigger, open, items } = render();
    expect(trigger.textContent).toContain('Exporter');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await open();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(items().map((item) => item.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Tableau CSV tableau-v1',
      'Copier pour Confluence',
      'Confluence (wiki markup)',
      'Session complète JSON v1',
    ]);
    expect(document.activeElement).toBe(items()[0]);
  });

  it.each([
    ['csv', 'csv', 'atelier-tableau-v1.csv'],
    ['wiki', 'confluence-wiki', 'atelier-confluence-v1.txt'],
    ['json', 'json', 'atelier-session-v1.json'],
  ] as const)('downloads the %s file under its versioned name', async (id, format, fileName) => {
    const { choose, exportFile, saveFile, notice, element, trigger } = render();

    await choose(id);

    expect(exportFile).toHaveBeenCalledWith(SESSION_ID, format);
    expect(saveFile).toHaveBeenCalledWith(FILES[format].blob, fileName);
    expect(element.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(notice()?.getAttribute('role')).toBe('status');
    expect(notice()?.textContent).toContain(`Fichier téléchargé : ${fileName}`);
  });

  it('copies the HTML table for Confluence', async () => {
    const { choose, exportFile, copied, saveFile, notice } = render();

    await choose('confluence');

    expect(exportFile).toHaveBeenCalledWith(SESSION_ID, 'confluence-html');
    expect(copied).toEqual(['<table></table>']);
    expect(saveFile).not.toHaveBeenCalled();
    expect(notice()?.textContent).toContain('Tableau copié : collez-le dans une page Confluence.');
  });

  it('proposes the wiki markup when the browser cannot copy HTML', async () => {
    const { choose, notice } = render({ copy: async () => Promise.reject(new Error('no')) });

    await choose('confluence');

    expect(notice()?.getAttribute('role')).toBe('alert');
    expect(notice()?.textContent).toContain('téléchargez le wiki markup');
  });

  it('reports a failed export, and a session that no longer exists', async () => {
    const failed = render({
      exportFile: async () => Promise.reject(new SessionApiError('network')),
    });
    await failed.choose('csv');
    expect(failed.saveFile).not.toHaveBeenCalled();
    expect(failed.notice()?.getAttribute('role')).toBe('alert');
    expect(failed.notice()?.textContent).toContain('L’export a échoué');

    TestBed.resetTestingModule();
    const gone = render({
      exportFile: async () => Promise.reject(new SessionApiError('notFound')),
    });
    await gone.choose('confluence');
    expect(gone.notice()?.textContent).toContain('Cette session n’existe plus');
  });

  it('hides a success message after a few seconds; the close button hides any message', async () => {
    const { choose, notice, fixture } = render();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await choose('csv');
    expect(notice()).not.toBeNull();

    vi.advanceTimersByTime(EXPORT_NOTICE_MS);
    fixture.detectChanges();
    expect(notice()).toBeNull();

    await choose('json');
    notice()!.querySelector('button')!.click();
    fixture.detectChanges();
    expect(notice()).toBeNull();
  });

  it('moves with the arrow keys and closes with Escape, the focus back on the button', async () => {
    const { open, items, trigger, element, fixture } = render();
    await open();
    const menu = element.querySelector<HTMLElement>('[role="menu"]')!;
    const key = (target: HTMLElement, name: string) => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
      fixture.detectChanges();
    };

    key(items()[0], 'ArrowDown');
    expect(document.activeElement).toBe(items()[1]);
    key(items()[1], 'End');
    expect(document.activeElement).toBe(items()[3]);
    key(items()[3], 'ArrowDown');
    expect(document.activeElement).toBe(items()[0]);
    key(items()[0], 'ArrowUp');
    expect(document.activeElement).toBe(items()[3]);
    key(items()[3], 'Home');
    expect(document.activeElement).toBe(items()[0]);
    key(menu, 'Escape');

    expect(element.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on a click elsewhere', async () => {
    const { open, element, fixture } = render();
    await open();

    document.body.click();
    fixture.detectChanges();

    expect(element.querySelector('[role="menu"]')).toBeNull();
  });
});
