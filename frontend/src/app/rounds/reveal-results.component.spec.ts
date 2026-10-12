import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { Round, SessionState } from '../api/contract';
import { SessionStateService } from '../session/session-state.service';
import {
  BOB,
  BOB_ID,
  FACILITATOR_ID,
  PARTICIPANT_ID,
  ROUND_ID,
  feature,
  featureResult,
  round,
  sessionState,
} from '../testing/fixtures';
import { SessionStub, sessionStub } from '../testing/session-stub';
import { RevealResultsComponent } from './reveal-results.component';

const F1 = feature();
const revealed = (): Round =>
  round({
    status: 'REVEALED',
    number: 2,
    results: [
      featureResult({
        votes: [
          { participantId: PARTICIPANT_ID, criteria: { bv: 8, tc: 4, rrOe: 3, js: null } },
          { participantId: FACILITATOR_ID, criteria: { bv: 8, tc: 9, rrOe: 3, js: 4 } },
        ],
        nonVoters: [BOB_ID],
        min: { bv: 8, tc: 4, rrOe: 3, js: 4 },
        max: { bv: 8, tc: 9, rrOe: 3, js: 4 },
        largeSpread: ['tc'],
        unanimous: { bv: 8, tc: null, rrOe: 3, js: 4 },
      }),
    ],
  });

describe('RevealResultsComponent', () => {
  let stub: SessionStub;

  beforeEach(() => {
    stub = sessionStub([F1]);
    TestBed.configureTestingModule({
      providers: [{ provide: SessionStateService, useValue: stub }],
    });
  });

  function mount(options: { canEdit?: boolean; state?: SessionState; hideable?: boolean } = {}) {
    const fixture = TestBed.createComponent(RevealResultsComponent);
    const state =
      options.state ??
      sessionState({ participants: [...sessionState().participants, BOB], features: [F1] });
    fixture.componentRef.setInput('state', state);
    fixture.componentRef.setInput('round', revealed());
    fixture.componentRef.setInput('canEdit', options.canEdit ?? false);
    fixture.componentRef.setInput('hideable', options.hideable ?? false);
    const events = { hidden: 0, selected: [] as string[] };
    fixture.componentInstance.hidden.subscribe(() => events.hidden++);
    fixture.componentInstance.featureSelected.subscribe((id) => events.selected.push(id));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const cells = (row: number) =>
      Array.from(root.querySelectorAll('tbody tr')[row].querySelectorAll('td')).map((c) =>
        c.textContent?.replace(/\s+/g, ' ').trim(),
      );
    const field = (code: string) =>
      root.querySelector(`input[aria-label="${code} retenu"]`) as HTMLInputElement;
    return {
      fixture,
      root,
      events,
      cells,
      field,
      text: () => root.textContent?.replace(/\s+/g, ' ') ?? '',
      type(code: string, value: string) {
        const input = field(code);
        input.value = value;
        input.dispatchEvent(new Event('input'));
      },
      async click(element: HTMLElement) {
        element.click();
        await fixture.whenStable();
        fixture.detectChanges();
      },
    };
  }

  it('shows every vote, « sans avis » for an empty criterion and « n’a pas voté »', () => {
    const ui = mount();
    expect(ui.cells(0)).toEqual(['alice', '8', '4', '3', 'sans avis']);
    expect(ui.cells(1)).toEqual(['eric', '8', '9', '3', '4']);
    expect(ui.cells(2)).toEqual(['bob', "n'a pas voté"]);
    expect(ui.root.querySelector('.noopinion')?.textContent).toBe('sans avis');
  });

  it('shows the minimum and maximum of each criterion with the large spread badge', () => {
    const ui = mount();
    expect(ui.cells(3)).toEqual(['Min – max', '8 – 8', '4 – 9 écart important', '3 – 3', '4 – 4']);
    expect(ui.root.querySelectorAll('.badge.warn')).toHaveLength(1);
  });

  it('shows an empty minimum and maximum when nobody gave a value', () => {
    const state = sessionState({ features: [F1] });
    const fixture = TestBed.createComponent(RevealResultsComponent);
    fixture.componentRef.setInput('state', state);
    fixture.componentRef.setInput(
      'round',
      round({ status: 'REVEALED', results: [featureResult({ nonVoters: [FACILITATOR_ID] })] }),
    );
    fixture.detectChanges();
    const minmax = (fixture.nativeElement as HTMLElement).querySelector('.minmax');
    expect(Array.from(minmax!.querySelectorAll('td')).map((c) => c.textContent?.trim())).toEqual([
      'Min – max',
      '—',
      '—',
      '—',
      '—',
    ]);
  });

  it('has a column per criterion of the method, with its definition', () => {
    const ui = mount();
    expect(
      Array.from(ui.root.querySelectorAll('thead th')).map((h) => h.textContent?.trim()),
    ).toEqual(['Participant', 'BV', 'TC', 'RR/OE', 'JS']);
    expect(ui.root.querySelectorAll('thead button.term')).toHaveLength(4);
  });

  it('is read-only for a participant: no consensus fields, no relaunch', () => {
    const ui = mount();
    expect(ui.root.querySelector('input')).toBeNull();
    expect(ui.text()).toContain('Tour 2 révélé : 1 fonctionnalité.');
    expect(ui.text()).not.toContain('Relancer');
  });

  it('prefills only the criteria where everyone who gave a value gave the same', () => {
    const ui = mount({ canEdit: true });
    expect(ui.text()).toContain('Discutez des écarts');
    expect(ui.field('BV').value).toBe('8');
    expect(ui.field('TC').value).toBe('');
    expect(ui.field('RR/OE').value).toBe('3');
    expect(ui.field('JS').value).toBe('4');
    expect(ui.field('BV').title).toContain('tous ceux qui ont donné une valeur');
    expect(ui.field('TC').title).toBe('');
  });

  it('saves the retained values with the current version of the feature in one intent', async () => {
    const ui = mount({ canEdit: true });
    ui.type('TC', '9');
    ui.type('BV', '6');
    await ui.click(ui.root.querySelector('.consensus .btn-primary') as HTMLElement);
    expect(stub.updateFeature).toHaveBeenCalledWith(F1.id, F1.version, {
      criteria: { bv: 6, tc: 9 },
    });
    expect(ui.text()).toContain('Valeurs retenues enregistrées.');
  });

  it('refuses a value outside the scale and sends nothing', async () => {
    const ui = mount({ canEdit: true });
    ui.type('TC', '11');
    await ui.click(ui.root.querySelector('.consensus .btn-primary') as HTMLElement);
    expect(stub.updateFeature).not.toHaveBeenCalled();
    expect(ui.root.querySelector('[role="alert"]')?.textContent).toContain(
      'TC : saisissez un nombre entier entre 1 et 10.',
    );
    expect(ui.field('TC').getAttribute('aria-invalid')).toBe('true');
  });

  it('sends nothing when every field is empty', async () => {
    const state = sessionState({ features: [F1] });
    const fixture = TestBed.createComponent(RevealResultsComponent);
    fixture.componentRef.setInput('state', state);
    fixture.componentRef.setInput(
      'round',
      round({ status: 'REVEALED', results: [featureResult()] }),
    );
    fixture.componentRef.setInput('canEdit', true);
    fixture.detectChanges();
    (
      (fixture.nativeElement as HTMLElement).querySelector('.consensus .btn-primary') as HTMLElement
    ).click();
    await fixture.whenStable();
    expect(stub.updateFeature).not.toHaveBeenCalled();
  });

  it('shows the refusal of the server', async () => {
    stub.updateFeature.mockResolvedValueOnce({ ok: false, code: 'FEATURE_IN_OPEN_ROUND' });
    const ui = mount({ canEdit: true });
    ui.type('TC', '9');
    await ui.click(ui.root.querySelector('.consensus .btn-primary') as HTMLElement);
    expect(ui.root.querySelector('[role="alert"]')?.textContent).toContain('en cours de vote');
  });

  it('relaunches a round on the checked features, from this round', async () => {
    const ui = mount({ canEdit: true });
    const launch = ui.root.querySelector('.reveal-actions .btn-primary') as HTMLButtonElement;
    expect(launch.disabled).toBe(true);
    expect(launch.textContent?.trim()).toBe('Relancer un tour sur la sélection (0)');
    await ui.click(
      ui.root.querySelector('input[aria-label="Relancer un tour sur F-1"]') as HTMLElement,
    );
    expect(launch.textContent?.trim()).toBe('Relancer un tour sur la sélection (1)');
    await ui.click(launch);
    expect(stub.openRound).toHaveBeenCalledWith([F1.id], ROUND_ID);
  });

  it('shows why a relaunch was refused and keeps the selection', async () => {
    stub.openRound.mockResolvedValueOnce({ ok: false, code: 'FEATURE_IN_OPEN_ROUND' });
    const ui = mount({ canEdit: true });
    const box = ui.root.querySelector(
      'input[aria-label="Relancer un tour sur F-1"]',
    ) as HTMLInputElement;
    await ui.click(box);
    await ui.click(ui.root.querySelector('.reveal-actions .btn-primary') as HTMLElement);
    expect(ui.root.querySelector('.reveal-actions .err')?.textContent).toContain(
      'en cours de vote',
    );
    expect(box.checked).toBe(true);
  });

  it('can be hidden, and opens the description from the identifier', async () => {
    const ui = mount({ hideable: true });
    await ui.click(ui.root.querySelector('.round-banner button') as HTMLElement);
    expect(ui.events.hidden).toBe(1);
    await ui.click(ui.root.querySelector('button.fid') as HTMLElement);
    expect(ui.events.selected).toEqual([F1.id]);
    expect(mount().root.querySelector('.round-banner button')).toBeNull();
  });

  it('skips the results of a feature that no longer exists', () => {
    const ui = mount({ state: sessionState({ features: [] }) });
    expect(ui.root.querySelectorAll('.reveal-card')).toHaveLength(0);
  });

  it('does not resend values that are already the retained ones', async () => {
    const ui = mount({ canEdit: true });
    ui.type('BV', '8');
    ui.type('TC', '5');
    ui.type('RR/OE', '3');
    ui.type('JS', '4');
    await ui.click(ui.root.querySelector('.consensus .btn-primary') as HTMLElement);
    expect(stub.updateFeature).not.toHaveBeenCalled();
    expect(ui.text()).toContain('Valeurs retenues enregistrées.');
  });

  it('sends only the values that differ from the retained ones', async () => {
    const ui = mount({ canEdit: true });
    ui.type('TC', '9');
    await ui.click(ui.root.querySelector('.consensus .btn-primary') as HTMLElement);
    expect(stub.updateFeature).toHaveBeenCalledWith(F1.id, F1.version, { criteria: { tc: 9 } });
  });
});
