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
    // Le classement, du premier niveau au dernier, puis les non classées.
    const values = () =>
      [
        ...element.querySelectorAll<HTMLInputElement>('.rank-ranked .rank-item input'),
        ...element.querySelectorAll<HTMLInputElement>('.rank-unranked .rank-item input'),
      ].map((input) => [input.getAttribute('aria-label'), input.value]);
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

  it('opens the help on demand, with the full explanation, and closes it with Escape', () => {
    const { element, click, toggle, fixture } = render();
    for (const code of ['TC', 'RR/OE', 'JS']) toggle(`${code} ·`);
    click('Commencer le classement');
    expect(element.querySelector('.ranking-help')?.textContent).toContain(
      'Classez de la plus forte à la plus faible pour BV (Business Value)',
    );
    const help = element.querySelector<HTMLButtonElement>('[aria-controls="ranking-help-panel"]')!;
    expect(help.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('#ranking-help-panel')).toBeNull();

    help.click();
    fixture.detectChanges();
    expect(help.getAttribute('aria-expanded')).toBe('true');
    const panel = element.querySelector<HTMLElement>('#ranking-help-panel')!;
    expect(panel.textContent).toContain('Les valeurs actuelles sont gardées');
    expect(panel.textContent).toContain('poignée ⠿');

    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(element.querySelector('#ranking-help-panel')).toBeNull();
    expect(document.activeElement).toBe(help);
  });

  const typeInto = (input: HTMLInputElement, text: string) => {
    input.value = text;
    input.dispatchEvent(new Event('input'));
  };
  const press = (element: HTMLElement, label: string) =>
    element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click();

  /** BV puis TC, terminé : F-3 à égalité avec F-2 en BV ; TC à 3 en tête, F-2 classée en dernier. */
  function rankBvAndTc(screen: ReturnType<typeof render>) {
    const { element, click, toggle, values, fixture } = screen;
    toggle('RR/OE ·');
    toggle('JS ·');
    click('Commencer le classement');
    expect(element.querySelector('h1 + p')?.textContent).toContain(
      'Critère 1 sur 2 : BV · Business Value · 3 fonctionnalité(s)',
    );
    // Valeurs actuelles gardées : F-1 (8), F-2 (3), F-3 non classée.
    expect(values()).toEqual([
      ['BV de F-1', '8'],
      ['BV de F-2', '3'],
      ['BV de F-3', ''],
    ]);
    press(element, 'Égalité avec le dernier niveau : F-3');
    fixture.detectChanges();
    click('Critère suivant');
    expect(element.querySelector('h1 + p')?.textContent).toContain('Critère 2 sur 2 : TC');
    typeInto(element.querySelector<HTMLInputElement>('#ranking-top-value')!, '3');
    fixture.detectChanges();
    press(element, 'Classer en dernier : F-2');
    fixture.detectChanges();
    expect(values()).toEqual([
      ['TC de F-1', '3'],
      ['TC de F-2', '2'],
      ['TC de F-3', ''],
    ]);
    click('Terminer et enregistrer');
  }

  const sentMessages = (room: FakeRoom) =>
    room.updateFeature.mock.calls.map(([message]) => message);

  it('ranks each chosen criterion in turn, sends one change per feature with its starting version, and waits for the server', () => {
    const screen = render();
    const { element, room, closed, fixture } = screen;
    rankBvAndTc(screen);
    expect(sentMessages(room)).toEqual([
      { featureId: 'f1', version: 2, criteria: { tc: 3 } },
      { featureId: 'f2', version: 0, criteria: { tc: 2 } },
      { featureId: 'f3', version: 5, criteria: { bv: 3 } },
    ]);
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Enregistrement…');
    expect(closed()).toBe(0);

    room.state.set(
      state({
        features: [
          { ...F1, version: 3, criteria: { ...F1.criteria, tc: 3 } },
          { ...F2, version: 1, criteria: { bv: 3, tc: 2 } },
          { ...F3, version: 6, criteria: { bv: 3 } },
        ],
      }),
    );
    fixture.detectChanges();
    expect(closed()).toBe(1);
  });

  it('stays open after a refusal, names what was not saved, and can send it again on the current version', () => {
    const screen = render();
    const { element, room, click, closed, fixture } = screen;
    rankBvAndTc(screen);
    // F-1 modifiée entre-temps par un autre poste : refusée ; F-2 et F-3 enregistrées.
    room.state.set(
      state({
        features: [
          { ...F1, version: 7, criteria: { ...F1.criteria, bv: 9 } },
          { ...F2, version: 1, criteria: { bv: 3, tc: 2 } },
          { ...F3, version: 6, criteria: { bv: 3 } },
        ],
      }),
    );
    room.refusal.set({ code: 'STALE_VERSION', featureId: 'f1' });
    fixture.detectChanges();
    const alert = element.querySelector('.ranking-unsaved')!;
    expect(alert.textContent).toContain('La fonctionnalité a été modifiée entre-temps');
    expect([...alert.querySelectorAll('li')].map((li) => li.textContent?.trim())).toEqual([
      'F-1 (TC 3)',
    ]);
    expect(closed()).toBe(0);

    room.updateFeature.mockClear();
    click('Enregistrer quand même');
    expect(sentMessages(room)).toEqual([{ featureId: 'f1', version: 7, criteria: { tc: 3 } }]);
    expect(element.querySelector('.ranking-unsaved')).toBeNull();

    room.state.set(
      state({
        features: [
          { ...F1, version: 8, criteria: { ...F1.criteria, bv: 9, tc: 3 } },
          { ...F2, version: 1, criteria: { bv: 3, tc: 2 } },
          { ...F3, version: 6, criteria: { bv: 3 } },
        ],
      }),
    );
    fixture.detectChanges();
    expect(closed()).toBe(1);
  });

  it('goes back to the board after a refusal, and forgets it', () => {
    const screen = render();
    const { room, click, closed, fixture } = screen;
    rankBvAndTc(screen);
    room.refusal.set({ code: 'STALE_VERSION', featureId: 'f1' });
    fixture.detectChanges();
    click('Retour au tableau');
    expect(room.clearRefusal).toHaveBeenCalled();
    expect(closed()).toBe(1);
  });

  it('says when nothing could be sent, or when the connection drops while waiting', () => {
    const lost = render();
    lost.room.updateFeature.mockReturnValue(false);
    rankBvAndTc(lost);
    expect(lost.element.querySelector('.ranking-unsaved')?.textContent).toContain(
      'Connexion perdue',
    );
    // Un nouvel essai qui échoue encore le redit.
    lost.click('Enregistrer quand même');
    expect(lost.element.querySelector('.ranking-unsaved')?.textContent).toContain(
      'Connexion perdue',
    );
    TestBed.resetTestingModule();

    const dropped = render();
    rankBvAndTc(dropped);
    dropped.room.connection.set('lost');
    dropped.fixture.detectChanges();
    expect(dropped.element.querySelector('.ranking-unsaved')?.textContent).toContain(
      'Connexion perdue',
    );
    expect(dropped.closed()).toBe(0);
  });

  it('sends nothing when no value changes, and closes', () => {
    const { room, click, closed } = render();
    click('Commencer le classement');
    for (let i = 0; i < 3; i++) click('Critère suivant');
    click('Terminer et enregistrer');
    expect(room.updateFeature).not.toHaveBeenCalled();
    expect(closed()).toBe(1);
  });

  it('keeps the rankings when going back, even when the selection changes', () => {
    const { element, click, toggle, values, fixture } = render();
    click('Commencer le classement');
    press(element, 'Monter : F-2');
    fixture.detectChanges();
    click('Critère suivant');
    click('Précédent');
    expect(values().map(([label]) => label)).toEqual(['BV de F-2', 'BV de F-1', 'BV de F-3']);
    click('Précédent');
    expect(element.querySelector('fieldset')).not.toBeNull();
    toggle('F-3');
    click('Commencer le classement');
    expect(values().map(([label]) => label)).toEqual(['BV de F-2', 'BV de F-1']);

    click('Précédent');
    toggle('F-3');
    click('Commencer le classement');
    expect(values().map(([label]) => label)).toEqual(['BV de F-2', 'BV de F-1', 'BV de F-3']);
  });

  it('blocks the next step while a value is invalid', () => {
    const { element, button, click, fixture } = render();
    click('Commencer le classement');
    typeInto(element.querySelector<HTMLInputElement>('#ranking-top-value')!, '0');
    fixture.detectChanges();
    expect(button('Critère suivant').disabled).toBe(true);
  });

  it('sends nothing for a feature deleted meanwhile', () => {
    const { element, room, click, toggle, closed, fixture } = render([F2, F3]);
    for (const code of ['TC', 'RR/OE', 'JS']) toggle(`${code} ·`);
    click('Commencer le classement');
    press(element, 'Égalité avec le dernier niveau : F-3');
    fixture.detectChanges();
    room.state.set(state({ features: [F2] }));
    click('Terminer et enregistrer');
    expect(room.updateFeature).not.toHaveBeenCalled();
    expect(closed()).toBe(1);
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
