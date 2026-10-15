import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { state, WSJF } from '../testing/fixtures';
import {
  CriterionRankingComponent,
  RankedItem,
  RankingStep,
  resolveStep,
} from './criterion-ranking.component';

const SCALE = state().scale;
const ITEMS: ReadonlyMap<string, RankedItem> = new Map(
  ['a', 'b', 'c'].map((id) => [id, { id, externalId: `F-${id}`, title: `Titre ${id}` }]),
);

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
  readonly step = signal<RankingStep>({ levels: [['a'], ['b'], ['c']], top: '8', overrides: {} });
}

describe('resolveStep', () => {
  it('gives each feature its level proposal, or the value typed by hand', () => {
    const values = resolveStep(
      { levels: [['a', 'b'], ['c']], top: '5', overrides: { b: '9' } },
      SCALE,
    );
    expect(Object.fromEntries(values ?? [])).toEqual({ a: 5, b: 9, c: 4 });
  });

  it('keeps a value emptied by hand, and leaves features without value once the scale runs out', () => {
    const values = resolveStep(
      { levels: [['a'], ['b'], ['c']], top: '2', overrides: { a: '' } },
      SCALE,
    );
    expect(Object.fromEntries(values ?? [])).toEqual({ a: null, b: 1, c: null });
  });

  it('refuses an invalid or empty top value, or an invalid value typed by hand', () => {
    expect(resolveStep({ levels: [['a']], top: '', overrides: {} }, SCALE)).toBeNull();
    expect(resolveStep({ levels: [['a']], top: '11', overrides: {} }, SCALE)).toBeNull();
    expect(resolveStep({ levels: [['a']], top: '3', overrides: { a: '0' } }, SCALE)).toBeNull();
  });
});

describe('CriterionRankingComponent', () => {
  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const host = fixture.componentInstance;
    return { fixture, element, host };
  }

  const values = (element: HTMLElement) =>
    [...element.querySelectorAll<HTMLInputElement>('.rank-item input')].map((input) => [
      input.getAttribute('aria-label'),
      input.value,
    ]);
  const levelsOf = (element: HTMLElement) =>
    [...element.querySelectorAll('.rank-items')].map((list) =>
      [...list.querySelectorAll('.fid-text')].map((id) => id.textContent?.trim()),
    );
  const action = (element: HTMLElement, label: string) =>
    element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const type = (input: HTMLInputElement, text: string) => {
    input.value = text;
    input.dispatchEvent(new Event('input'));
  };

  it('shows one level per rank with the proposed values, from the top value down', () => {
    const { element } = render();
    expect(levelsOf(element)).toEqual([['F-a'], ['F-b'], ['F-c']]);
    expect(values(element)).toEqual([
      ['BV de F-a', '8'],
      ['BV de F-b', '7'],
      ['BV de F-c', '6'],
    ]);
    expect(element.querySelector('label')?.textContent).toContain('Valeur du premier niveau (BV)');
  });

  it('moves and ties features with the buttons, and the proposals follow the levels', () => {
    const { fixture, element, host } = render();
    expect(action(element, 'Monter : F-a').disabled).toBe(true);
    expect(action(element, 'Égalité avec au-dessus : F-a').disabled).toBe(true);

    action(element, 'Égalité avec au-dessus : F-b').click();
    fixture.detectChanges();
    expect(host.step().levels).toEqual([['a', 'b'], ['c']]);
    expect(values(element).map(([, value]) => value)).toEqual(['8', '8', '7']);

    action(element, 'Monter : F-c').click();
    fixture.detectChanges();
    action(element, 'Descendre : F-a').click();
    fixture.detectChanges();
    expect(levelsOf(element)).toEqual([['F-c'], ['F-b'], ['F-a']]);
    expect(action(element, 'Descendre : F-a').disabled).toBe(true);
  });

  it('keeps the focus on the moved feature', async () => {
    const { fixture, element } = render();
    action(element, 'Descendre : F-a').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Descendre : F-a');

    action(element, 'Descendre : F-a').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('BV de F-a');
  });

  it('recomputes the proposals when the top value changes, and flags an invalid one', () => {
    const { fixture, element } = render();
    type(element.querySelector<HTMLInputElement>('#ranking-top-value')!, '2');
    fixture.detectChanges();
    expect(values(element).map(([, value]) => value)).toEqual(['2', '1', '']);

    type(element.querySelector<HTMLInputElement>('#ranking-top-value')!, '12');
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'La valeur du premier niveau doit être un entier entre 1 et 10.',
    );
    expect(values(element).map(([, value]) => value)).toEqual(['', '', '']);
  });

  it('keeps a value changed by hand, marks it, checks it, and goes back to the proposals on demand', () => {
    const { fixture, element, host } = render();
    const reset = [...element.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Revenir aux valeurs proposées'),
    )!;
    expect(reset.disabled).toBe(true);

    type(element.querySelectorAll<HTMLInputElement>('.rank-item input')[1]!, '3');
    fixture.detectChanges();
    expect(host.step().overrides).toEqual({ b: '3' });
    expect(element.querySelector('.rank-item .badge')?.textContent).toContain('modifiée');

    type(element.querySelectorAll<HTMLInputElement>('.rank-item input')[1]!, '30');
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'BV doit être un entier entre 1 et 10',
    );

    reset.click();
    fixture.detectChanges();
    expect(host.step().overrides).toEqual({});
    expect(values(element).map(([, value]) => value)).toEqual(['8', '7', '6']);
  });

  it('drops a dragged feature into a level, or between two levels', () => {
    const { fixture, element, host } = render();
    const drag = (id: string) => {
      const item = element.querySelector(`[data-id="${id}"]`)!;
      item.dispatchEvent(new Event('dragstart'));
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

    drag('a');
    dropOn(element.querySelector('.rank-gap-end')!);
    expect(host.step().levels).toEqual([['c'], ['b'], ['a']]);

    // Sans glisser en cours, survoler une zone ne fait rien.
    const over = new Event('dragover', { cancelable: true });
    element.querySelector('.rank-gap')!.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(false);
  });
});
