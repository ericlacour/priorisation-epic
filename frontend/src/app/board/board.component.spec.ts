import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { SessionState } from '../api/contract';
import { ScreenSizeService } from '../layout/screen-size.service';
import { SessionStateService } from '../session/session-state.service';
import {
  REACH_EFFORT,
  computedScore,
  feature,
  incompleteFeature,
  maskedFeature,
  outOfScaleFeature,
  participantState,
  sessionState,
} from '../testing/fixtures';
import { sessionStub } from '../testing/session-stub';
import { BoardComponent } from './board.component';

function mount(state: SessionState, options: { editable?: boolean; phone?: boolean } = {}) {
  TestBed.configureTestingModule({
    providers: [
      { provide: ScreenSizeService, useValue: { isPhone: signal(options.phone ?? false) } },
      { provide: SessionStateService, useValue: sessionStub(state.features) },
    ],
  });
  const fixture = TestBed.createComponent(BoardComponent);
  fixture.componentRef.setInput('state', state);
  fixture.componentRef.setInput('editable', options.editable ?? false);
  const selected: string[] = [];
  fixture.componentInstance.featureSelected.subscribe((id) => selected.push(id));
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    root,
    selected,
    rows: () => Array.from(root.querySelectorAll('tbody tr')) as HTMLElement[],
    cells: (row: HTMLElement) =>
      Array.from(row.querySelectorAll('td')).map((c) => c.textContent?.replace(/\s+/g, ' ').trim()),
    headers: () =>
      Array.from(root.querySelectorAll('thead th')).map((h) =>
        h.textContent?.replace(/\s+/g, ' ').trim(),
      ),
  };
}

const ranked = () => [
  feature({ id: 'f1', externalId: 'F-1', title: 'Paiement en un clic' }),
  feature({
    id: 'f4',
    externalId: 'F-4',
    title: 'Export comptable',
    criteria: { bv: 5, tc: 6, rrOe: 2, js: 5 },
    score: computedScore({ cod: '13', wsjf: '2,60' }, 2),
  }),
  incompleteFeature({ id: 'f3' }),
];

describe('BoardComponent', () => {
  describe('columns come from the method definition (FR-017b)', () => {
    it('shows rank, identifier, title, then each criterion and computed value of WSJF', () => {
      const ui = mount(sessionState({ features: ranked() }));
      expect(ui.headers()).toEqual([
        'Rang',
        'Identifiant',
        'Titre',
        'BV',
        'TC',
        'RR/OE',
        'JS',
        'CoD',
        'WSJF',
      ]);
    });

    it('shows the columns of another method without any WSJF code (SC-009)', () => {
      const f = feature({
        criteria: { reach: 9, effort: 3 },
        score: computedScore({ ratio: '3,00' }, 1),
      });
      const ui = mount(sessionState({ methodDefinition: REACH_EFFORT, features: [f] }));
      expect(ui.headers()).toEqual(['Rang', 'Identifiant', 'Titre', 'Portée', 'Effort', 'Ratio']);
      expect(ui.cells(ui.rows()[0])).toEqual(['1', 'F-1', 'Paiement en un clic', '9', '3', '3,00']);
      expect(ui.root.textContent).not.toContain('WSJF');
    });

    it('lets the user read each sigle definition from its header', () => {
      const ui = mount(sessionState({ features: ranked() }));
      const first = ui.root.querySelector('thead th button') as HTMLButtonElement;
      expect(first.getAttribute('aria-label')).toContain('BV, Business Value');
    });
  });

  describe('rows', () => {
    it('keeps the order received: the server sorts, the front never reorders', () => {
      const ui = mount(sessionState({ features: ranked().reverse() }));
      expect(ui.rows().map((r) => r.querySelector('.fid')?.textContent?.trim())).toEqual([
        'F-3',
        'F-4',
        'F-1',
      ]);
    });

    it('shows values and the computed values exactly as formatted by the server', () => {
      const ui = mount(sessionState({ features: ranked() }));
      expect(ui.cells(ui.rows()[0])).toEqual([
        '1',
        'F-1',
        'Paiement en un clic',
        '8',
        '5',
        '3',
        '4',
        '16',
        '4,00',
      ]);
      expect(ui.rows()[0].querySelector('td.wsjf')?.textContent?.trim()).toBe('4,00');
    });

    it('shows « non calculé » and dashes for an incomplete feature', () => {
      const ui = mount(sessionState({ features: ranked() }));
      const row = ui.rows()[2];
      expect(ui.cells(row)).toEqual([
        '—',
        'F-3',
        'Programme de fidélité',
        '6',
        '—',
        '—',
        '—',
        '—',
        'non calculé',
      ]);
      expect(row.classList.contains('incomplete')).toBe(true);
    });

    it('flags an out-of-scale feature and its value', () => {
      const ui = mount(sessionState({ features: [outOfScaleFeature()] }));
      const row = ui.rows()[0];
      expect(row.querySelector('.badge.warn')?.textContent?.trim()).toBe('hors échelle');
      const marked = row.querySelector('td .review');
      expect(marked?.textContent?.trim()).toBe('13');
      expect(marked?.getAttribute('title')).toBe('Valeur hors échelle (1 à 10)');
    });

    it('shows the « à revoir » badge with its reason', () => {
      const f = feature({ markedForReview: true, reviewReason: 'descriptif à compléter' });
      const badge = mount(sessionState({ features: [f] })).root.querySelector('.badge.review');
      expect(badge?.textContent?.trim()).toBe('à revoir');
      expect(badge?.getAttribute('title')).toBe('À revoir : descriptif à compléter');
    });

    it('opens the detail of a feature from its identifier', () => {
      const ui = mount(sessionState({ features: ranked() }));
      (ui.rows()[1].querySelector('.fid') as HTMLButtonElement).click();
      expect(ui.selected).toEqual(['f4']);
    });

    it('explains an empty board', () => {
      const ui = mount(sessionState({ features: [] }));
      expect(ui.rows()[0].textContent).toContain("Aucune fonctionnalité pour l'instant.");
      expect(ui.rows()[0].textContent).not.toContain('« + Fonctionnalité »');
    });

    it('shows the formula and the tie-break rule as a legend (principle I)', () => {
      const ui = mount(sessionState({ features: ranked() }));
      const legend = ui.root.querySelector('.legend')?.textContent ?? '';
      expect(legend).toContain('CoD = BV + TC + RR/OE ; WSJF = CoD / JS');
      expect(legend).toContain('WSJF décroissant, puis CoD décroissant');
    });
  });

  describe('masking during a round (FR-019a)', () => {
    it('shows no value, only « vote en cours », for a masked feature', () => {
      const ui = mount(participantState({ features: [maskedFeature(), feature()] }));
      const row = ui.rows()[0];
      expect(row.classList.contains('masked')).toBe(true);
      expect(row.querySelector('.badge.vote')?.textContent?.trim()).toBe('vote en cours');
      const mask = row.querySelector('td.cell-mask');
      expect(mask?.textContent?.trim()).toBe("Valeurs masquées jusqu'à la révélation du tour");
      expect(mask?.getAttribute('colspan')).toBe('6');
      expect(row.textContent).not.toMatch(/\d,\d\d/);
    });
  });

  describe('who can act', () => {
    it('shows no action to a participant: same table, no « Modifier », no add (FR-014b)', () => {
      const ui = mount(participantState({ features: ranked() }));
      expect(ui.root.querySelectorAll('thead th')).toHaveLength(9);
      expect(ui.root.querySelectorAll('tbody button:not(.fid)')).toHaveLength(0);
      expect(ui.root.textContent).not.toContain('+ Fonctionnalité');
      expect(ui.root.textContent).not.toContain('Modifier');
    });

    it('gives the facilitator an add button and a « Modifier » per row', () => {
      const ui = mount(sessionState({ features: ranked() }), { editable: true });
      expect(ui.headers()).toHaveLength(10);
      expect(ui.root.querySelector('.board-actions button')?.textContent?.trim()).toBe(
        '+ Fonctionnalité',
      );
      const edits = Array.from(ui.root.querySelectorAll('tbody .btn-ghost')) as HTMLButtonElement[];
      expect(edits.map((b) => b.getAttribute('aria-label'))).toEqual([
        'Modifier F-1',
        'Modifier F-4',
        'Modifier F-3',
      ]);
    });

    it('suggests adding the first feature to the facilitator of an empty board', () => {
      const ui = mount(sessionState({ features: [] }), { editable: true });
      expect(ui.rows()[0].textContent).toContain('Ajoutez votre première fonctionnalité');
    });

    it('opens an editor row to add, and disables the other actions meanwhile', () => {
      const ui = mount(sessionState({ features: ranked() }), { editable: true });
      (ui.root.querySelector('.board-actions button') as HTMLButtonElement).click();
      ui.fixture.detectChanges();
      expect(ui.rows()[0].matches('tr.edit-row')).toBe(true);
      expect((ui.root.querySelector('tbody .btn-ghost') as HTMLButtonElement).disabled).toBe(true);
      // « Annuler » ferme la ligne d'ajout
      (ui.rows()[0].querySelector('.btn-secondary') as HTMLButtonElement).click();
      ui.fixture.detectChanges();
      expect(ui.root.querySelectorAll('tr.edit-row')).toHaveLength(0);
    });

    it('replaces the row of a feature by its editor, then restores it', () => {
      const ui = mount(sessionState({ features: ranked() }), { editable: true });
      (ui.root.querySelectorAll('tbody .btn-ghost')[1] as HTMLButtonElement).click();
      ui.fixture.detectChanges();
      const editing = ui.rows()[1];
      expect(editing.matches('tr.edit-row')).toBe(true);
      expect(editing.querySelector('b')?.textContent).toBe('F-4');
      expect((ui.root.querySelector('.board-actions button') as HTMLButtonElement).disabled).toBe(
        true,
      );
      (editing.querySelector('.btn-secondary') as HTMLButtonElement).click();
      ui.fixture.detectChanges();
      expect(ui.rows()[1].matches('tr.edit-row')).toBe(false);
      expect(ui.rows()[1].textContent).toContain('Export comptable');
    });

    it('opens a single editor row at a time', () => {
      const ui = mount(sessionState({ features: ranked() }), { editable: true });
      (ui.root.querySelector('.board-actions button') as HTMLButtonElement).click();
      ui.fixture.detectChanges();
      expect(ui.root.querySelectorAll('tr.edit-row')).toHaveLength(1);
    });
  });

  describe('on a phone', () => {
    it('shows read-only cards instead of the table, with no action', () => {
      const ui = mount(sessionState({ features: ranked() }), { editable: false, phone: true });
      expect(ui.root.querySelector('table')).toBeNull();
      const cards = Array.from(ui.root.querySelectorAll('.fcard'));
      expect(cards).toHaveLength(3);
      expect(cards[0].textContent).toContain('F-1');
      expect(cards[0].textContent).toContain('BV 8');
      expect(cards[0].textContent).toContain('CoD 16');
      expect(cards[0].querySelector('.wsjf-big')?.textContent?.trim()).toBe('4,00');
      // le résultat n'est pas répété dans la liste des valeurs de la carte
      expect(cards[0].querySelector('.crit')?.textContent).not.toContain('WSJF');
      expect(ui.root.textContent).toContain('CoD = BV + TC + RR/OE ; WSJF = CoD / JS');
    });

    it('shows « non calculé » or « hors échelle » instead of the result', () => {
      const ui = mount(sessionState({ features: [incompleteFeature(), outOfScaleFeature()] }), {
        phone: true,
      });
      const results = Array.from(ui.root.querySelectorAll('.wsjf-big')).map((e) =>
        e.textContent?.trim(),
      );
      expect(results).toEqual(['non calculé', 'hors échelle']);
      expect(ui.root.querySelectorAll('.wsjf-big.wsjf-missing')).toHaveLength(2);
    });

    it('masks the values of a feature in a round, and shows the review badge', () => {
      const ui = mount(
        participantState({ features: [maskedFeature(), feature({ markedForReview: true })] }),
        { phone: true },
      );
      const [masked, reviewed] = Array.from(ui.root.querySelectorAll('.fcard'));
      expect(masked.querySelector('.badge.vote')?.textContent?.trim()).toBe('vote en cours');
      expect(masked.querySelector('.crit')).toBeNull();
      expect(reviewed.querySelector('.badge.review')?.textContent?.trim()).toBe('à revoir');
    });

    it('shows the single computed value of another method as the card result (SC-009)', () => {
      const f = feature({
        criteria: { reach: 9, effort: 3 },
        score: computedScore({ ratio: '3,00' }, 1),
      });
      const ui = mount(sessionState({ methodDefinition: REACH_EFFORT, features: [f] }), {
        phone: true,
      });
      const card = ui.root.querySelector('.fcard')!;
      expect(card.querySelector('.wsjf-big')?.textContent?.trim()).toBe('3,00');
      expect(card.querySelector('.crit')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        'Portée 9 Effort 3',
      );
    });

    it('opens the detail from a card', () => {
      const ui = mount(sessionState({ features: ranked() }), { phone: true });
      (ui.root.querySelector('.fcard .fid') as HTMLButtonElement).click();
      expect(ui.selected).toEqual(['f1']);
    });

    it('shows a note when there is no feature', () => {
      const ui = mount(sessionState({ features: [] }), { phone: true });
      expect(ui.root.textContent).toContain("Aucune fonctionnalité pour l'instant.");
    });
  });
});
