import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { state, WSJF } from '../testing/fixtures';
import { CriterionRankingComponent, RankedItem } from './criterion-ranking.component';
import { RankingStep, newStep } from './ranking';

const SCALE = state().scale;
const ITEMS: ReadonlyMap<string, RankedItem> = new Map(
  ['a', 'b', 'c', 'd'].map((id) => [id, { id, externalId: `F-${id}`, title: `Titre ${id}` }]),
);
/** a et b ont une valeur (8 et 5), c et d non. */
const VALUES: Record<string, number | null> = { a: 8, b: 5, c: null, d: null };

@Component({
  imports: [CriterionRankingComponent],
  template: `<app-criterion-ranking
    [items]="items"
    [criterion]="criterion"
    [scale]="scale"
    [(step)]="step"
  />`,
})
class HostComponent {
  readonly items = ITEMS;
  readonly criterion = WSJF.criteria[0]!;
  readonly scale = SCALE;
  readonly step = signal<RankingStep>(newStep(['a', 'b', 'c', 'd'], (id) => VALUES[id], SCALE));
}

describe('CriterionRankingComponent', () => {
  function render(step?: RankingStep) {
    const fixture = TestBed.createComponent(HostComponent);
    if (step) fixture.componentInstance.step.set(step);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const host = fixture.componentInstance;
    return { fixture, element, host };
  }

  /** Les champs de valeur : le classement, du premier niveau au dernier, puis les non classées. */
  const inputs = (element: HTMLElement) => [
    ...element.querySelectorAll<HTMLInputElement>('.rank-ranked .rank-item input'),
    ...element.querySelectorAll<HTMLInputElement>('.rank-unranked .rank-item input'),
  ];
  const values = (element: HTMLElement) =>
    inputs(element).map((input) => [input.getAttribute('aria-label'), input.value]);
  const levelsOf = (element: HTMLElement) =>
    [...element.querySelectorAll('.ranking-levels .rank-items')].map((list) =>
      [...list.querySelectorAll('.fid-text')].map((id) => id.textContent?.trim()),
    );
  const unrankedOf = (element: HTMLElement) =>
    [...element.querySelectorAll('.rank-unranked .fid-text')].map((id) => id.textContent?.trim());
  const action = (element: HTMLElement, label: string) =>
    element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const type = (input: HTMLInputElement, text: string) => {
    input.value = text;
    input.dispatchEvent(new Event('input'));
  };

  it('keeps the current values: valued features by level, the others unranked and without value', () => {
    const { element } = render();
    expect(levelsOf(element)).toEqual([['F-a'], ['F-b']]);
    expect(unrankedOf(element)).toEqual(['F-c', 'F-d']);
    expect(values(element)).toEqual([
      ['BV de F-a', '8'],
      ['BV de F-b', '5'],
      ['BV de F-c', ''],
      ['BV de F-d', ''],
    ]);
    expect(element.querySelector<HTMLInputElement>('#ranking-top-value')!.value).toBe('8');
    expect(element.querySelector('label')?.textContent).toContain('Valeur du premier niveau (BV)');
    expect(element.textContent).toContain('Non classées (sans valeur)');
  });

  it('moves and ties features with the buttons: only the moved one gets a proposed value', () => {
    const { fixture, element, host } = render();
    expect(action(element, 'Monter : F-a').disabled).toBe(true);
    expect(action(element, 'Égalité avec au-dessus : F-a').disabled).toBe(true);
    expect(action(element, 'Descendre : F-b').disabled).toBe(true);

    action(element, 'Monter : F-b').click();
    fixture.detectChanges();
    expect(levelsOf(element)).toEqual([['F-b'], ['F-a']]);
    // F-b passe devant F-a, pas à égalité : la valeur juste au-dessus, reprise par la valeur du premier niveau.
    expect(values(element).slice(0, 2)).toEqual([
      ['BV de F-b', '9'],
      ['BV de F-a', '8'],
    ]);
    expect(element.querySelector<HTMLInputElement>('#ranking-top-value')!.value).toBe('9');

    action(element, 'Descendre : F-b').click();
    fixture.detectChanges();
    action(element, 'Égalité avec au-dessus : F-b').click();
    fixture.detectChanges();
    expect(host.step().levels).toEqual([['a', 'b']]);
    expect(
      values(element)
        .slice(0, 2)
        .map(([, value]) => value),
    ).toEqual(['8', '8']);
  });

  it('tints every other level, so that two neighbouring levels stand apart', () => {
    const { fixture, element } = render();
    action(element, 'Classer en dernier : F-c').click();
    fixture.detectChanges();
    const tinted = [...element.querySelectorAll('.rank-level')].map((level) =>
      level.classList.contains('rank-level-alt'),
    );
    expect(tinted).toEqual([false, true, false]);
  });

  it('ranks an unranked feature last, or ties it with the last level', () => {
    const { fixture, element, host } = render();
    action(element, 'Classer en dernier : F-c').click();
    fixture.detectChanges();
    action(element, 'Égalité avec le dernier niveau : F-d').click();
    fixture.detectChanges();
    expect(host.step().levels).toEqual([['a'], ['b'], ['c', 'd']]);
    expect(unrankedOf(element)).toEqual([]);
    expect(element.querySelector('.rank-unranked')?.textContent).toContain(
      'Toutes les fonctionnalités sont classées.',
    );
    expect(values(element).map(([, value]) => value)).toEqual(['8', '5', '4', '4']);
  });

  it('keeps the focus on the moved feature', async () => {
    const { fixture, element } = render();
    action(element, 'Classer en dernier : F-c').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Monter : F-c');

    action(element, 'Descendre : F-a').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Descendre : F-a');

    action(element, 'Descendre : F-a').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('BV de F-a');
  });

  it('proposes a value to every level once the top value is typed, and flags an invalid one', () => {
    const { fixture, element } = render();
    type(element.querySelector<HTMLInputElement>('#ranking-top-value')!, '2');
    fixture.detectChanges();
    expect(values(element).map(([, value]) => value)).toEqual(['2', '1', '', '']);

    type(element.querySelector<HTMLInputElement>('#ranking-top-value')!, '12');
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'La valeur du premier niveau doit être un entier entre 1 et 10.',
    );
    expect(values(element).map(([, value]) => value)).toEqual(['', '', '', '']);
  });

  it('keeps the current values when the top value is typed again unchanged', () => {
    const { fixture, element, host } = render();
    action(element, 'Classer en dernier : F-c').click();
    fixture.detectChanges();
    const top = element.querySelector<HTMLInputElement>('#ranking-top-value')!;
    // On efface « 8 », on tape « 1 » puis « 10 » : 10 propose des valeurs à tous les niveaux…
    for (const text of ['', '1', '10']) {
      type(top, text);
      fixture.detectChanges();
    }
    expect(values(element).map(([, value]) => value)).toEqual(['10', '9', '8', '']);
    // … et revenir à « 8 » rend les valeurs actuelles : rien n'est écrasé.
    for (const text of ['', '8']) {
      type(top, text);
      fixture.detectChanges();
    }
    expect(host.step().topTouched).toBe(false);
    expect(values(element).map(([, value]) => value)).toEqual(['8', '5', '4', '']);
  });

  it('keeps a value changed by hand, marks it, checks it, and goes back to the proposals on demand', () => {
    const { fixture, element, host } = render();
    const reset = [...element.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Revenir aux valeurs proposées'),
    )!;
    expect(reset.disabled).toBe(true);

    type(inputs(element)[1]!, '3');
    fixture.detectChanges();
    expect(host.step().overrides).toEqual({ b: '3' });
    expect(element.querySelector('.rank-item .badge')?.textContent).toContain('modifiée');

    type(inputs(element)[1]!, '30');
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'BV doit être un entier entre 1 et 10',
    );

    reset.click();
    fixture.detectChanges();
    expect(host.step().overrides).toEqual({});
    expect(values(element).map(([, value]) => value)).toEqual(['8', '5', '', '']);
  });

  it('drags by the handle only, so the value fields stay clickable', () => {
    const { element } = render();
    expect(element.querySelector('.rank-item')?.getAttribute('draggable')).toBeNull();
    expect(element.querySelector('.drag-handle')?.getAttribute('draggable')).toBe('true');
  });

  it('drops a dragged feature into a level, between two levels, or back with the unranked ones', () => {
    const { fixture, element, host } = render();
    const drag = (id: string) => {
      element
        .querySelector(`[data-id="${id}"] .drag-handle`)!
        .dispatchEvent(new Event('dragstart'));
      fixture.detectChanges();
    };
    const dropOn = (target: Element) => {
      const over = new Event('dragover', { cancelable: true });
      target.dispatchEvent(over);
      fixture.detectChanges();
      expect(over.defaultPrevented).toBe(true);
      expect(target.classList).toContain('drop-target');
      target.dispatchEvent(new Event('drop', { cancelable: true }));
      fixture.detectChanges();
    };

    drag('c');
    expect(element.querySelector('[data-id="c"]')?.classList).toContain('dragging');
    dropOn(element.querySelectorAll('.rank-level-body')[0]!);
    expect(host.step().levels).toEqual([['a', 'c'], ['b']]);
    expect(host.step().unranked).toEqual(['d']);

    drag('a');
    dropOn(element.querySelector('.rank-gap-end')!);
    expect(host.step().levels).toEqual([['c'], ['b'], ['a']]);

    drag('b');
    dropOn(element.querySelectorAll('.rank-level-body')[1]!);
    expect(host.step().levels).toEqual([['c'], ['b'], ['a']]);

    drag('a');
    dropOn(element.querySelector('.rank-unranked')!);
    expect(host.step().unranked).toEqual(['d', 'a']);

    // Sans glisser en cours, survoler une zone ne fait rien.
    const over = new Event('dragover', { cancelable: true });
    element.querySelector('.rank-gap')!.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(false);
  });

  it('says how to start when nothing is ranked yet', () => {
    const { element } = render(newStep(['c'], () => null, SCALE));
    expect(element.textContent).toContain('Aucune fonctionnalité classée');
    expect(action(element, 'Égalité avec le dernier niveau : F-c').disabled).toBe(true);
    expect(element.querySelector<HTMLInputElement>('#ranking-top-value')!.value).toBe('10');
  });
});
