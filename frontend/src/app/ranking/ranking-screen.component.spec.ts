import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { SessionRoomService } from '../session/session-room.service';
import { FakeRoom } from '../testing/fake-room';
import { F1, F2, feature, state } from '../testing/fixtures';
import { RankingScreenComponent } from './ranking-screen.component';

const F3 = feature({ id: 'f3', externalId: 'F-3', title: 'Programme de fidélité', version: 5 });
const IN_ROUND = feature({ id: 'f4', externalId: 'F-4', votingInProgress: true });

describe('RankingScreenComponent', () => {
  function render(features = [F1, F2, F3]) {
    const room = new FakeRoom();
    room.canAnimate.set(true);
    room.state.set(state({ features }));
    TestBed.configureTestingModule({
      providers: [{ provide: SessionRoomService, useValue: room }],
    });
    const fixture = TestBed.createComponent(RankingScreenComponent);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const click = (text: string) => {
      const target = [...element.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.trim().startsWith(text) && !b.getAttribute('aria-label'),
      );
      if (!target) throw new Error(`no button ${text}`);
      target.click();
      fixture.detectChanges();
    };
    const button = (text: string) =>
      [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.trim().startsWith(text),
      )!;
    const checkbox = (text: string) =>
      [...element.querySelectorAll('label.check')]
        .find((label) => label.textContent?.includes(text))!
        .querySelector<HTMLInputElement>('input')!;
    const toggle = (text: string) => {
      checkbox(text).click();
      fixture.detectChanges();
    };
    const values = () =>
      [...element.querySelectorAll<HTMLInputElement>('.rank-item input')].map((input) => [
        input.getAttribute('aria-label'),
        input.value,
      ]);
    return {
      fixture,
      room,
      element,
      click,
      button,
      checkbox,
      toggle,
      values,
      closed: () => closed,
    };
  }

  it('starts with every criterion and every feature outside an open round chosen', () => {
    const { element, checkbox } = render([F1, IN_ROUND]);
    expect(element.querySelector('h1')?.textContent).toContain('Prioriser par classement');
    expect(['BV', 'TC', 'RR/OE', 'JS'].map((code) => checkbox(`${code} ·`).checked)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(checkbox('F-1').checked).toBe(true);
    expect(checkbox('F-4').checked).toBe(false);
    expect(checkbox('F-4').disabled).toBe(true);
    expect(element.textContent).toContain('(tour de vote ouvert)');
  });

  it('needs at least one criterion and one feature to start', () => {
    const { element, button, click, toggle } = render();
    click('Tout désélectionner');
    expect(button('Commencer le classement').disabled).toBe(true);
    expect(element.textContent).toContain('Choisissez au moins une fonctionnalité.');
    click('Tout sélectionner');
    for (const code of ['BV', 'TC', 'RR/OE', 'JS']) toggle(`${code} ·`);
    expect(button('Commencer le classement').disabled).toBe(true);
    expect(element.textContent).toContain('Choisissez au moins un critère.');
    toggle('TC ·');
    expect(button('Commencer le classement').disabled).toBe(false);
  });

  it('ranks each chosen criterion in turn, then sends one change per feature, with its starting version', () => {
    const { element, room, click, toggle, values, closed, fixture } = render();
    toggle('RR/OE ·');
    toggle('JS ·');
    click('Commencer le classement');
    expect(element.querySelector('h1 + p')?.textContent).toContain(
      'Critère 1 sur 2 : BV · Business Value · 3 fonctionnalité(s)',
    );
    // F-1 (BV 8) puis F-2 (BV 3), puis F-3 sans valeur.
    expect(values()).toEqual([
      ['BV de F-1', '10'],
      ['BV de F-2', '9'],
      ['BV de F-3', '8'],
    ]);
    // F-3 à égalité avec F-2.
    element
      .querySelector<HTMLButtonElement>('[aria-label="Égalité avec au-dessus : F-3"]')!
      .click();
    fixture.detectChanges();
    click('Critère suivant');
    expect(element.querySelector('h1 + p')?.textContent).toContain('Critère 2 sur 2 : TC');
    // TC : F-1 (5) puis les autres sans valeur ; premier niveau à 3 et F-3 vidée à la main.
    const top = element.querySelector<HTMLInputElement>('#ranking-top-value')!;
    top.value = '3';
    top.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const f3 = element.querySelectorAll<HTMLInputElement>('.rank-item input')[2]!;
    f3.value = '';
    f3.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(values()).toEqual([
      ['TC de F-1', '3'],
      ['TC de F-2', '2'],
      ['TC de F-3', ''],
    ]);

    click('Terminer et enregistrer');
    expect(room.updateFeature.mock.calls.map(([message]) => message)).toEqual([
      { featureId: 'f1', version: 2, criteria: { bv: 10, tc: 3 } },
      { featureId: 'f2', version: 0, criteria: { bv: 9, tc: 2 } },
      { featureId: 'f3', version: 5, criteria: { bv: 9 } },
    ]);
    expect(closed()).toBe(1);
  });

  it('keeps the rankings when going back, and only restarts them when the selection changes', () => {
    const { element, click, toggle, values, fixture } = render();
    click('Commencer le classement');
    element.querySelector<HTMLButtonElement>('[aria-label="Monter : F-3"]')!.click();
    fixture.detectChanges();
    click('Critère suivant');
    click('Précédent');
    expect(values().map(([label]) => label)).toEqual(['BV de F-1', 'BV de F-3', 'BV de F-2']);
    click('Précédent');
    expect(element.querySelector('fieldset')).not.toBeNull();
    click('Commencer le classement');
    expect(values().map(([label]) => label)).toEqual(['BV de F-1', 'BV de F-3', 'BV de F-2']);

    click('Précédent');
    toggle('F-2');
    click('Commencer le classement');
    expect(values().map(([label]) => label)).toEqual(['BV de F-1', 'BV de F-3']);
  });

  it('blocks the next step while a value is invalid', () => {
    const { element, button, click, fixture } = render();
    click('Commencer le classement');
    const top = element.querySelector<HTMLInputElement>('#ranking-top-value')!;
    top.value = '0';
    top.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(button('Critère suivant').disabled).toBe(true);
  });

  it('sends nothing for unchanged values, nor for a feature deleted meanwhile', () => {
    const unchanged = feature({ id: 'u', externalId: 'U-1', criteria: { bv: 10 } });
    const { room, click, toggle, closed } = render([unchanged, F3]);
    for (const code of ['TC', 'RR/OE', 'JS']) toggle(`${code} ·`);
    click('Commencer le classement');
    room.state.set(state({ features: [unchanged] }));
    click('Terminer et enregistrer');
    expect(room.updateFeature).not.toHaveBeenCalled();
    expect(closed()).toBe(1);
  });

  it('stays open with a message when the connection is lost', () => {
    const { element, room, click, closed } = render();
    room.updateFeature.mockReturnValue(false);
    click('Commencer le classement');
    for (let i = 0; i < 3; i++) click('Critère suivant');
    click('Terminer et enregistrer');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Connexion perdue');
    expect(closed()).toBe(0);
  });

  it('goes back to the board on cancel, or when the facilitator rights are lost', () => {
    const { room, click, closed, fixture } = render();
    click('Annuler');
    expect(closed()).toBe(1);
    room.canAnimate.set(false);
    fixture.detectChanges();
    expect(closed()).toBe(2);
    expect(room.updateFeature).not.toHaveBeenCalled();
  });
});
