import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { SessionRoomService } from './session-room.service';
import { FakeRoom } from '../testing/fake-room';
import { F1, feature, state } from '../testing/fixtures';
import { SettingsDialogComponent } from './settings-dialog.component';

describe('SettingsDialogComponent', () => {
  function render(initial = state()) {
    const room = new FakeRoom();
    room.state.set(initial);
    TestBed.configureTestingModule({
      providers: [{ provide: SessionRoomService, useValue: room }],
    });
    const fixture = TestBed.createComponent(SettingsDialogComponent);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    fixture.detectChanges();
    return { fixture, room, closed, element: fixture.nativeElement as HTMLElement };
  }

  const button = (element: HTMLElement, label: string) =>
    [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes(label),
    );
  const chips = (element: HTMLElement) =>
    [...element.querySelectorAll('.chips li')].map((li) => li.textContent?.trim());

  it('starts from the scale of the session', () => {
    const { element } = render();
    const checked = element.querySelector('[role="radio"][aria-checked="true"]');
    expect(checked?.textContent).toContain('Entiers continus');
    expect((element.querySelector('#settings-max') as HTMLInputElement).value).toBe('10');
    expect(chips(element)).toHaveLength(10);
  });

  it('applies a widened scale without confirmation and closes once the state carries it', () => {
    const { fixture, room, closed, element } = render();
    const input = element.querySelector('#settings-max') as HTMLInputElement;
    input.value = '20';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(chips(element)).toHaveLength(20);

    button(element, 'Appliquer')!.click();
    expect(room.updateSettings).toHaveBeenCalledWith({ scale: { type: 'CONTINUOUS', max: 20 } });
    expect(closed).not.toHaveBeenCalled();

    room.state.set(
      state({
        scale: {
          type: 'CONTINUOUS',
          max: 20,
          allowedValues: [...Array(20).keys()].map((i) => i + 1),
        },
      }),
    );
    fixture.detectChanges();
    expect(closed).toHaveBeenCalled();
  });

  it('switches to Fibonacci with its default bound and lists its values', () => {
    const { fixture, element } = render();
    button(element, 'Suite de Fibonacci')!.click();
    fixture.detectChanges();

    const select = element.querySelector('select#settings-max') as HTMLSelectElement;
    expect(select.value).toBe('20');
    expect(chips(element)).toEqual(['1', '2', '3', '5', '8', '13', '20']);
    select.value = '13';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(chips(element)).toEqual(['1', '2', '3', '5', '8', '13']);
  });

  it('lists the impacted values of a SCALE_IMPACT, then confirms the change', () => {
    const outOfScale = feature({
      id: 'f5',
      externalId: 'F-5',
      criteria: { bv: 7, js: 13 },
      score: { complete: false, outOfScale: ['js'], computed: null, explanation: null, rank: null },
    });
    const { fixture, room, element } = render(state({ features: [F1, outOfScale] }));
    button(element, 'Suite de Fibonacci')!.click();
    fixture.detectChanges();
    const select = element.querySelector('select#settings-max') as HTMLSelectElement;
    select.value = '13';
    select.dispatchEvent(new Event('change'));
    button(element, 'Appliquer')!.click();
    expect(room.updateSettings).toHaveBeenLastCalledWith({ scale: { type: 'FIBONACCI', max: 13 } });

    room.refusal.set({
      code: 'SCALE_IMPACT',
      impactedValues: [
        { externalId: 'F-1', criterion: 'js', value: 4 },
        { externalId: 'F-5', criterion: 'bv', value: 7 },
      ],
    });
    fixture.detectChanges();
    const alert = element.querySelector('[role="alert"]')?.textContent?.replace(/\s+/g, ' ');
    expect(alert).toContain('2 valeur(s) deviennent hors échelle.');
    expect(alert).toContain('F-1 : JS = 4');
    expect(alert).toContain('F-5 : BV = 7');
    expect(alert).toContain('redeviennent valides : F-5 JS = 13.');

    button(element, 'Confirmer le changement')!.click();
    expect(room.updateSettings).toHaveBeenLastCalledWith({
      scale: { type: 'FIBONACCI', max: 13 },
      confirm: true,
    });
  });

  it('refuses a bound outside 2 to 100', () => {
    const { fixture, room, element } = render();
    const input = element.querySelector('#settings-max') as HTMLInputElement;
    input.value = '101';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(element.querySelector('#settings-max-error')?.textContent).toContain(
      'La borne doit être un entier de 2 à 100.',
    );
    expect(button(element, 'Appliquer')?.disabled).toBe(true);
    expect(room.updateSettings).not.toHaveBeenCalled();
  });

  it('closes without sending when the scale does not change, and on cancel', () => {
    const { room, closed, element } = render();
    button(element, 'Appliquer')!.click();
    expect(room.updateSettings).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledTimes(1);
    button(element, 'Annuler')!.click();
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it('shows another refusal as a message', () => {
    const { fixture, room, element } = render();
    room.refusal.set({ code: 'SESSION_CLOSED' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('clôturée');
  });
});
