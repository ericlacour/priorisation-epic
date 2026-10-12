import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { Round, Scale, SessionState } from '../api/contract';
import { SessionStateService } from '../session/session-state.service';
import { REACH_EFFORT, ROUND_ID, feature, round, sessionState } from '../testing/fixtures';
import { SessionStub, sessionStub } from '../testing/session-stub';
import { VotePanelComponent } from './vote-panel.component';

describe('VotePanelComponent', () => {
  let stub: SessionStub;

  beforeEach(() => {
    stub = sessionStub();
    TestBed.configureTestingModule({
      providers: [{ provide: SessionStateService, useValue: stub }],
    });
  });

  function mount(state: SessionState = sessionState(), current: Round = round()) {
    const fixture = TestBed.createComponent(VotePanelComponent);
    fixture.componentRef.setInput('state', state);
    fixture.componentRef.setInput('round', current);
    const selected: string[] = [];
    fixture.componentInstance.featureSelected.subscribe((id) => selected.push(id));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const input = (label: string) =>
      Array.from(root.querySelectorAll('label'))
        .find((l) => l.textContent?.includes(label))!
        .querySelector('input') as HTMLInputElement;
    return {
      fixture,
      root,
      selected,
      input,
      type(label: string, value: string) {
        const field = input(label);
        field.value = value;
        field.dispatchEvent(new Event('input'));
      },
      async commit(label: string) {
        input(label).dispatchEvent(new Event('change'));
        await fixture.whenStable();
        fixture.detectChanges();
      },
      text: () => root.textContent?.replace(/\s+/g, ' ') ?? '',
    };
  }

  it('shows one input per criterion of the method, with its code and label', () => {
    const ui = mount();
    const labels = Array.from(ui.root.querySelectorAll('label')).map((l) =>
      l.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(labels).toEqual([
      'BV · Business Value',
      'TC · Time Criticality',
      'RR/OE · Risk Reduction / Opportunity Enablement',
      'JS · Job Size',
    ]);
    expect(ui.root.querySelector('input')?.getAttribute('placeholder')).toBe('sans avis');
    expect(ui.text()).toContain('Comprendre le WSJF');
    expect(ui.text()).toContain('un nombre entier entre 1 et 10');
  });

  it('works with any method: the inputs follow methodDefinition', () => {
    const state = sessionState({ methodDefinition: REACH_EFFORT });
    const ui = mount(state);
    expect(Array.from(ui.root.querySelectorAll('label')).map((l) => l.textContent?.trim())).toEqual(
      ['Portée · Reach', 'Effort · Effort'],
    );
  });

  it('starts from what the server kept and marks a scored feature « Noté »', () => {
    const f = feature();
    const ui = mount(
      sessionState(),
      round({ myVotes: { [f.id]: { bv: 8, tc: null, rrOe: 3, js: null } } }),
    );
    expect(ui.input('BV').value).toBe('8');
    expect(ui.input('TC').value).toBe('');
    expect(ui.input('RR/OE').value).toBe('3');
    expect(ui.text()).toContain('Noté');
    expect(mount().text()).toContain('À noter');
  });

  it('sends the vote when leaving a field, empty fields meaning « sans avis »', async () => {
    const ui = mount();
    ui.type('BV', '8');
    ui.type('RR/OE', ' 3 ');
    await ui.commit('RR/OE');
    expect(stub.castVote).toHaveBeenCalledWith(ROUND_ID, feature().id, {
      bv: 8,
      tc: null,
      rrOe: 3,
      js: null,
    });
  });

  it.each([
    ['0', 'BV : saisissez un nombre entier entre 1 et 10.'],
    ['11', 'BV : saisissez un nombre entier entre 1 et 10.'],
    ['2,5', 'BV : saisissez un nombre entier entre 1 et 10.'],
    ['abc', 'BV : saisissez un nombre entier entre 1 et 10.'],
  ])('refuses « %s » without sending anything', async (value, message) => {
    const ui = mount();
    ui.type('BV', value);
    await ui.commit('BV');
    ui.fixture.detectChanges();
    expect(stub.castVote).not.toHaveBeenCalled();
    expect(ui.root.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(ui.input('BV').getAttribute('aria-invalid')).toBe('true');
    expect(ui.input('TC').getAttribute('aria-invalid')).toBeNull();
  });

  it('lists the allowed values on a Fibonacci scale', async () => {
    const scale: Scale = { type: 'FIBONACCI', max: 13, allowedValues: [1, 2, 3, 5, 8, 13] };
    const ui = mount(sessionState({ scale }));
    ui.type('JS', '4');
    await ui.commit('JS');
    expect(ui.root.querySelector('[role="alert"]')?.textContent).toContain(
      'JS : valeurs autorisées : 1, 2, 3, 5, 8, 13.',
    );
    expect(ui.text()).toContain("l'une des valeurs suivantes : 1, 2, 3, 5, 8, 13");
  });

  it('shows the refusal of the server and keeps the typed value', async () => {
    stub.castVote.mockResolvedValueOnce({ ok: false, code: 'ROUND_REVEALED' });
    const ui = mount();
    ui.type('BV', '8');
    await ui.commit('BV');
    expect(ui.root.querySelector('[role="alert"]')?.textContent).toContain('Ce tour est révélé');
    expect(ui.input('BV').value).toBe('8');
  });

  it('does not overwrite a field being edited when the state is refreshed', () => {
    const ui = mount();
    ui.type('BV', '7');
    ui.fixture.componentRef.setInput(
      'round',
      round({ myVotes: { [feature().id]: { bv: 2, tc: 4, rrOe: null, js: null } } }),
    );
    ui.fixture.detectChanges();
    expect(ui.input('BV').value).toBe('7');
  });

  it('refreshes the fields from the server when nothing is being edited', () => {
    const ui = mount();
    ui.fixture.componentRef.setInput(
      'round',
      round({ myVotes: { [feature().id]: { bv: 2, tc: 4, rrOe: null, js: null } } }),
    );
    ui.fixture.detectChanges();
    expect(ui.input('BV').value).toBe('2');
    expect(ui.input('TC').value).toBe('4');
  });

  it('opens the description of a feature from its identifier', () => {
    const ui = mount();
    (ui.root.querySelector('button.fid') as HTMLButtonElement).click();
    expect(ui.selected).toEqual([feature().id]);
  });

  it('only shows the features of the round', () => {
    const other = feature({ id: 'other', externalId: 'F-8', title: 'Autre' });
    const ui = mount(sessionState({ features: [feature(), other] }));
    expect(ui.root.querySelectorAll('.vote-feature')).toHaveLength(1);
  });
});
