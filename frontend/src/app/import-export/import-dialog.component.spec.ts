import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { ImportPreview } from '../api/contract';
import { SessionApi, SessionApiError } from '../api/session-api';
import { SessionRoomService } from '../session/session-room.service';
import { FakeRoom } from '../testing/fake-room';
import { SESSION_ID, state } from '../testing/fixtures';
import { settle } from '../testing/helpers';
import { ImportDialogComponent } from './import-dialog.component';

const PREVIEW: ImportPreview = {
  previewId: 'preview-1',
  sourceType: 'XLSX',
  expiresAt: '2026-10-11T14:15:00Z',
  validRows: [
    {
      line: 2,
      externalId: 'F-1',
      title: 'Paiement',
      description: null,
      criteria: { bv: 8, js: 4 },
    },
    { line: 3, externalId: 'F-2', title: 'Export', description: null, criteria: {} },
  ],
  rejectedRows: [{ line: 4, externalId: null, reason: 'Identifiant vide' }],
  warnings: [
    { line: 0, message: 'Les tours de vote et les votes du fichier ne sont pas réimportés.' },
    { line: 3, message: 'BV = 12 hors échelle : valeur ignorée' },
  ],
  ignoredColumns: [],
};

describe('ImportDialogComponent', () => {
  function render(api: Partial<Record<keyof SessionApi, unknown>> = {}) {
    const room = new FakeRoom();
    room.state.set(state());
    const fake = {
      previewImport: vi.fn(async () => PREVIEW),
      confirmImport: vi.fn(async () => ({ imported: 2, rejected: 1 })),
      templateUrl: vi.fn(
        () => 'https://api.example/api/import-template.xlsx?method=WSJF&methodVersion=1',
      ),
      ...api,
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: SessionRoomService, useValue: room },
        { provide: SessionApi, useValue: fake },
      ],
    });
    const fixture = TestBed.createComponent(ImportDialogComponent);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    fixture.detectChanges();
    return { fixture, room, api: fake, closed, element: fixture.nativeElement as HTMLElement };
  }

  async function choose(fixture: {
    detectChanges(): void;
    whenStable(): Promise<unknown>;
    nativeElement: HTMLElement;
  }) {
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'epics.xlsx');
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    await settle(fixture);
    return file;
  }

  const text = (element: HTMLElement) => element.textContent?.replace(/\s+/g, ' ') ?? '';
  /** Les cellules du tableau de l'onglet ouvert, séparées par une espace, une ligne par entrée. */
  const panelRows = (element: HTMLElement) =>
    [...element.querySelectorAll('[role="tabpanel"] tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent?.trim()).join(' '),
    );
  const button = (element: HTMLElement, label: string) =>
    [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes(label),
    );

  it('shows the expected headers of the method and the template link', () => {
    const { element } = render();
    expect(text(element)).toContain(
      'En-têtes attendus : Identifiant, Titre, Description, BV, TC, RR/OE, JS.',
    );
    const link = element.querySelector('a[download]') as HTMLAnchorElement;
    expect(link.textContent).toContain('Télécharger le modèle Excel');
    expect(link.getAttribute('href')).toContain('import-template.xlsx?method=WSJF');
  });

  it('previews the file without writing, with the rejected rows first', async () => {
    const { fixture, api, element } = render();
    const file = await choose(fixture);

    expect(api.previewImport).toHaveBeenCalledWith(SESSION_ID, file, 'epics.xlsx', {
      participantToken: 'p-token',
      animationToken: 'a-token',
    });
    expect(api.confirmImport).not.toHaveBeenCalled();
    expect(text(element)).toContain('epics.xlsx · 3 lignes lues');
    expect([...element.querySelectorAll('.stat b')].map((b) => b.textContent)).toEqual([
      '2',
      '1',
      '2',
    ]);
    const selected = element.querySelector('[role="tab"][aria-selected="true"]');
    expect(selected?.textContent).toContain('Rejetées (1)');
    expect(panelRows(element)).toEqual(['4 — Identifiant vide']);

    button(element, 'Valides (2)')!.click();
    fixture.detectChanges();
    expect(panelRows(element)).toEqual(['2 F-1 Paiement 8 — — 4', '3 F-2 Export — — — —']);
    button(element, 'Avertissements (2)')!.click();
    fixture.detectChanges();
    expect(panelRows(element)[0]).toContain('Fichier Les tours de vote');
  });

  it('imports the valid rows on confirmation, then shows the summary', async () => {
    const { fixture, api, element, closed } = render();
    await choose(fixture);

    button(element, 'Importer 2 lignes')!.click();
    await settle(fixture);

    expect(api.confirmImport).toHaveBeenCalledWith(SESSION_ID, 'preview-1', {
      participantToken: 'p-token',
      animationToken: 'a-token',
    });
    expect(text(element)).toContain('2 fonctionnalité(s) importée(s), 1 ligne(s) rejetée(s).');
    button(element, 'Terminer')!.click();
    expect(closed).toHaveBeenCalled();
  });

  it('imports nothing on cancel', async () => {
    const { fixture, api, element, closed } = render();
    await choose(fixture);

    button(element, 'Annuler')!.click();

    expect(closed).toHaveBeenCalled();
    expect(api.confirmImport).not.toHaveBeenCalled();
  });

  it('shows the reason of a refused file and lets another one be chosen', async () => {
    const { fixture, element } = render({
      previewImport: vi.fn(async () => {
        throw new SessionApiError('invalid', 'Le fichier n’a pas les colonnes obligatoires.');
      }),
    });
    await choose(fixture);

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Le fichier n’a pas les colonnes obligatoires.',
    );
    expect(element.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('explains a file too large, a missing right and a network failure', async () => {
    for (const [error, message] of [
      [new SessionApiError('tooLarge'), 'Le fichier dépasse 5 Mo.'],
      [new SessionApiError('forbidden'), 'Seul l’animateur peut importer'],
      [new SessionApiError('notFound'), "Cette session n'existe pas."],
      [new Error('boom'), 'Le service ne répond pas.'],
    ] as const) {
      TestBed.resetTestingModule();
      const { fixture, element } = render({
        previewImport: vi.fn(async () => {
          throw error;
        }),
      });
      await choose(fixture);
      expect(element.querySelector('[role="alert"]')?.textContent).toContain(message);
    }
  });

  it('asks for a new file when the preview expired', async () => {
    const { fixture, element } = render({
      confirmImport: vi.fn(async () => {
        throw new SessionApiError('notFound');
      }),
    });
    await choose(fixture);
    button(element, 'Importer 2 lignes')!.click();
    await settle(fixture);

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('L’aperçu a expiré');
    expect(element.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('keeps the preview when the confirmation fails for another reason', async () => {
    const { fixture, element } = render({
      confirmImport: vi.fn(async () => {
        throw new SessionApiError('network');
      }),
    });
    await choose(fixture);
    button(element, 'Importer 2 lignes')!.click();
    await settle(fixture);

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Le service ne répond pas',
    );
    expect(button(element, 'Importer 2 lignes')?.disabled).toBe(false);
  });

  it('announces the scale of a JSON export applied to an empty session', async () => {
    const { fixture, element } = render({
      previewImport: vi.fn(async () => ({
        ...PREVIEW,
        rejectedRows: [],
        validRows: [PREVIEW.validRows[0]],
        scale: { type: 'FIBONACCI', max: 20 },
      })),
    });
    await choose(fixture);

    expect(text(element)).toContain(
      'l’échelle du fichier sera appliquée : Fibonacci 1, 2, 3, 5, 8, 13, 20.',
    );
    expect(button(element, 'Importer 1 ligne')).toBeDefined();
  });

  it('cannot import without the facilitator tokens of this browser', async () => {
    const { fixture, room, api, element } = render();
    room.facilitatorTokens.mockReturnValue(null);
    await choose(fixture);

    expect(api.previewImport).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Seul l’animateur');
  });

  it('cannot confirm a preview without any valid row', async () => {
    const { fixture, element } = render({
      previewImport: vi.fn(async () => ({ ...PREVIEW, validRows: [] })),
    });
    await choose(fixture);

    expect(text(element)).toContain('Aucune ligne valide : rien ne sera importé.');
    expect(button(element, 'Importer 0 lignes')?.disabled).toBe(true);
    button(element, 'Choisir un autre fichier')!.click();
    fixture.detectChanges();
    expect(element.querySelector('input[type="file"]')).not.toBeNull();
  });
});
