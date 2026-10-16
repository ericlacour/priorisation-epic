import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ActionBarComponent } from './action-bar.component';

describe('ActionBarComponent', () => {
  function render(inputs: { animate: boolean; editing?: boolean; hasFeatures?: boolean }) {
    const fixture = TestBed.createComponent(ActionBarComponent);
    fixture.componentRef.setInput('animate', inputs.animate);
    fixture.componentRef.setInput('editing', inputs.editing ?? false);
    fixture.componentRef.setInput('hasFeatures', inputs.hasFeatures ?? true);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = (text: string) =>
      [...element.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.trim() === text,
      )!;
    return { fixture, element, button };
  }

  it('gives the facilitator a toolbar with the entry and preparation groups (FR-014c)', () => {
    const { element } = render({ animate: true });
    expect(element.getAttribute('role')).toBe('toolbar');
    expect(element.getAttribute('aria-label')).toBe("Actions d'animation");
    const groups = [...element.querySelectorAll('[role="group"]')].map((group) => ({
      label: group.getAttribute('aria-label'),
      buttons: [...group.querySelectorAll('button')].map((b) => b.textContent?.trim()),
    }));
    expect(groups).toEqual([
      { label: 'Saisie', buttons: ['+ Fonctionnalité', 'Prioriser par classement'] },
      { label: 'Préparation', buttons: ['Importer', 'Échelle'] },
    ]);
    // Une seule action principale.
    expect(element.querySelectorAll('.btn-primary')).toHaveLength(1);
  });

  it('emits one output per action', () => {
    const { fixture, button } = render({ animate: true });
    const seen: string[] = [];
    const bar = fixture.componentInstance;
    bar.add.subscribe(() => seen.push('add'));
    bar.rank.subscribe(() => seen.push('rank'));
    bar.import.subscribe(() => seen.push('import'));
    bar.scale.subscribe(() => seen.push('scale'));

    for (const text of ['+ Fonctionnalité', 'Prioriser par classement', 'Importer', 'Échelle']) {
      button(text).click();
    }
    expect(seen).toEqual(['add', 'rank', 'import', 'scale']);
  });

  it('keeps the actions in place but disabled while a line is being edited', () => {
    const { element } = render({ animate: true, editing: true });
    const buttons = [...element.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons).toHaveLength(4);
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });

  it('disables « Prioriser par classement » on an empty board', () => {
    const { button } = render({ animate: true, hasFeatures: false });
    expect(button('Prioriser par classement').disabled).toBe(true);
    expect(button('+ Fonctionnalité').disabled).toBe(false);
  });

  it('gives a participant a status line instead of actions', () => {
    const { element } = render({ animate: false });
    expect(element.getAttribute('role')).toBe('status');
    expect(element.getAttribute('aria-label')).toBe('État de la session');
    expect(element.querySelectorAll('button')).toHaveLength(0);
    expect(element.textContent).toContain('Aucun tour de vote en cours.');
  });
});
