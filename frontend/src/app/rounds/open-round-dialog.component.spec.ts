import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { Feature } from '../api/contract';
import { SessionStateService } from '../session/session-state.service';
import {
  computedScore,
  feature,
  incompleteFeature,
  outOfScaleFeature,
  round,
  sessionState,
} from '../testing/fixtures';
import { SessionStub, sessionStub } from '../testing/session-stub';
import { OpenRoundDialogComponent } from './open-round-dialog.component';

const F1 = feature();
const F4 = feature({
  id: 'f4',
  externalId: 'F-4',
  title: 'Export comptable',
  score: computedScore({ cod: '13', wsjf: '2,60' }, 2),
});
const F9 = feature({
  id: 'f9',
  externalId: 'F-9',
  title: 'Avis clients',
  markedForReview: true,
  reviewReason: 'descriptif à compléter',
});
const F3 = incompleteFeature();
const F5 = outOfScaleFeature();
const F6 = feature({ id: 'f6', externalId: 'F-6', title: 'Suivi des retours' });

describe('OpenRoundDialogComponent', () => {
  let stub: SessionStub;

  beforeEach(() => {
    stub = sessionStub();
    TestBed.configureTestingModule({
      providers: [{ provide: SessionStateService, useValue: stub }],
    });
  });

  function mount(features: Feature[] = [F1, F4, F9, F3, F5, F6]) {
    const fixture = TestBed.createComponent(OpenRoundDialogComponent);
    fixture.componentRef.setInput(
      'state',
      sessionState({
        features,
        openRounds: [round({ number: 3, featureIds: [F6.id] })],
      }),
    );
    const events = { closed: 0, selected: [] as string[] };
    fixture.componentInstance.closed.subscribe(() => events.closed++);
    fixture.componentInstance.featureSelected.subscribe((id) => events.selected.push(id));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const box = (id: string) =>
      root.querySelector(`input[aria-label^="${id}"]`) as HTMLInputElement;
    const button = (text: string | RegExp) =>
      Array.from(root.querySelectorAll('button')).find((b) =>
        typeof text === 'string' ? b.textContent?.trim() === text : text.test(b.textContent ?? ''),
      ) as HTMLButtonElement;
    return {
      fixture,
      root,
      events,
      box,
      button,
      checked: () =>
        Array.from(root.querySelectorAll<HTMLInputElement>('tbody input:checked')).map((i) =>
          i.getAttribute('aria-label'),
        ),
      click(element: HTMLElement) {
        element.click();
        fixture.detectChanges();
      },
      type(value: string) {
        const input = root.querySelector('#open-round-search') as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
      },
    };
  }

  it('lists every feature with its state, and the locked ones with their round', () => {
    const ui = mount();
    const rows = Array.from(ui.root.querySelectorAll('tbody tr')).map((r) =>
      r.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(rows).toEqual([
      expect.stringContaining('F-1'),
      expect.stringContaining('WSJF 2,60'),
      expect.stringContaining('à revoir'),
      expect.stringContaining('non évaluée'),
      expect.stringContaining('hors échelle'),
      expect.stringContaining('déjà dans le tour 3'),
    ]);
    expect(rows[0]).toContain('WSJF 4,00');
    expect(ui.box('F-6').disabled).toBe(true);
    expect(ui.box('F-6').getAttribute('aria-label')).toBe('F-6, déjà dans le tour 3');
  });

  it('keeps the submit button disabled until something is checked, and counts the choice', () => {
    const ui = mount();
    expect(ui.button(/Ouvrir le tour/).disabled).toBe(true);
    ui.click(ui.box('F-1'));
    expect(ui.button(/Ouvrir le tour/).textContent?.trim()).toBe(
      'Ouvrir le tour (1 fonctionnalité)',
    );
    ui.click(ui.box('F-4'));
    expect(ui.button(/Ouvrir le tour/).textContent?.trim()).toBe(
      'Ouvrir le tour (2 fonctionnalités)',
    );
    expect(ui.root.querySelector('[role="status"]')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '2 fonctionnalités sélectionnées',
    );
  });

  it('selects quickly: all, unrated, out of scale, to review, none', () => {
    const ui = mount();
    ui.click(ui.button('Tout sélectionner'));
    expect(ui.checked()).toEqual(['F-1', 'F-4', 'F-9', 'F-3', 'F-5']);
    ui.click(ui.button('Tout désélectionner'));
    expect(ui.checked()).toEqual([]);
    ui.click(ui.button('Non évaluées (1)'));
    expect(ui.checked()).toEqual(['F-3']);
    ui.click(ui.button('Hors échelle (1)'));
    expect(ui.checked()).toEqual(['F-5']);
    ui.click(ui.button('À revoir (1)'));
    expect(ui.checked()).toEqual(['F-9']);
  });

  it('never selects a feature that is already in an open round', () => {
    const ui = mount();
    ui.click(ui.button('Tout sélectionner'));
    expect(ui.checked()).not.toContain('F-6, déjà dans le tour 3');
    expect(ui.root.querySelector('.selected, b')?.textContent).toBeDefined();
  });

  it('filters by identifier or title, and the header box selects the visible ones', () => {
    const ui = mount();
    ui.type('compt');
    expect(ui.root.querySelectorAll('tbody tr')).toHaveLength(1);
    ui.click(ui.root.querySelector('thead input') as HTMLElement);
    expect(ui.checked()).toEqual(['F-4']);
    ui.click(ui.root.querySelector('thead input') as HTMLElement);
    expect(ui.checked()).toEqual([]);
    ui.type('zzz');
    expect(ui.root.querySelector('tbody')?.textContent).toContain(
      'Aucune fonctionnalité ne correspond',
    );
    ui.type('f-1');
    expect(ui.root.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('opens the round on the checked features in board order, then closes', async () => {
    const ui = mount();
    ui.click(ui.box('F-4'));
    ui.click(ui.box('F-1'));
    ui.click(ui.button(/Ouvrir le tour/));
    await ui.fixture.whenStable();
    expect(stub.openRound).toHaveBeenCalledWith([F1.id, F4.id]);
    expect(ui.events.closed).toBe(1);
  });

  it('stays open and shows the refusal when the server refuses', async () => {
    stub.openRound.mockResolvedValueOnce({ ok: false, code: 'SESSION_NOT_STARTED' });
    const ui = mount();
    ui.click(ui.box('F-1'));
    ui.click(ui.button(/Ouvrir le tour/));
    await ui.fixture.whenStable();
    ui.fixture.detectChanges();
    expect(ui.root.querySelector('.err')?.textContent).toContain("La session n'est pas démarrée");
    expect(ui.events.closed).toBe(0);
  });

  it('opens the description of a feature from its identifier, and can be cancelled', () => {
    const ui = mount();
    ui.click(ui.root.querySelector('tbody button.fid') as HTMLElement);
    expect(ui.events.selected).toEqual([F1.id]);
    ui.click(ui.button('Annuler'));
    expect(ui.events.closed).toBe(1);
  });
});
