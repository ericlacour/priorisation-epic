import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Feature, SessionScale } from '../api/session-state';
import { F1, WSJF } from '../testing/fixtures';
import {
  FeatureEdit,
  FeatureEditorComponent,
  parseCriterionInput,
} from './feature-editor.component';

const SCALE: SessionScale = {
  type: 'CONTINUOUS',
  max: 10,
  allowedValues: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
};

@Component({
  imports: [FeatureEditorComponent],
  template: `<table>
    <tbody>
      <tr
        appFeatureEditor
        [feature]="feature()"
        [definition]="definition"
        [scale]="scale"
        (saved)="saved.push($event)"
        (cancelled)="cancelled = cancelled + 1"
        (removed)="removed = removed + 1"
      ></tr>
    </tbody>
  </table>`,
})
class Host {
  readonly feature = signal<Feature | null>(null);
  readonly definition = WSJF;
  readonly scale = SCALE;
  readonly saved: FeatureEdit[] = [];
  cancelled = 0;
  removed = 0;
}

describe('parseCriterionInput', () => {
  it('reads an integer of the scale, or an empty field as « no value »', () => {
    expect(parseCriterionInput('7', SCALE)).toBe(7);
    expect(parseCriterionInput(' 10 ', SCALE)).toBe(10);
    expect(parseCriterionInput('', SCALE)).toBeNull();
    expect(parseCriterionInput('  ', SCALE)).toBeNull();
  });

  it('refuses anything else', () => {
    for (const bad of ['0', '11', '-1', '2.5', '2,5', 'a', '1e1', '+3', '1 2']) {
      expect(parseCriterionInput(bad, SCALE)).toBeUndefined();
    }
  });
});

describe('FeatureEditorComponent', () => {
  function render(existing: Feature | null) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.feature.set(existing);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const type = (label: string, value: string) => {
      const input = element.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const button = (text: string) =>
      [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes(text),
      )!;
    return { fixture, host: fixture.componentInstance, element, type, button };
  }

  it('starts an existing line with its title and values', () => {
    const { element } = render(F1);
    expect(element.querySelector<HTMLInputElement>('input[aria-label="Titre"]')!.value).toBe(
      'Paiement en un clic',
    );
    expect(
      [...element.querySelectorAll<HTMLInputElement>('.num-input')].map((input) => input.value),
    ).toEqual(['8', '5', '3', '4']);
    expect(element.querySelector('.fid-text')?.textContent).toBe('F-1');
  });

  it('adds a feature with its id, title and the values entered', () => {
    const { fixture, host, type, button } = render(null);
    type('Identifiant', ' F-9 ');
    type('Titre', ' Nouvelle ');
    type('BV', '5');
    type('JS', '2');

    button('Enregistrer').click();
    fixture.detectChanges();

    expect(host.saved).toEqual([
      { externalId: 'F-9', title: 'Nouvelle', criteria: { bv: 5, js: 2 } },
    ]);
  });

  it('requires an id and a title for a new feature, and says what to fix only after a first try', () => {
    const { fixture, host, element, button } = render(null);
    expect(element.querySelector('[role="alert"]')).toBeNull();

    button('Enregistrer').click();
    fixture.detectChanges();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      "Saisissez l'identifiant",
    );
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Saisissez le titre');
    expect(host.saved).toEqual([]);
  });

  it('refuses a value outside the scale or not an integer, naming the criterion and the range', () => {
    const { fixture, host, element, type, button } = render(F1);
    type('BV', '11');
    type('TC', '2.5');

    button('Enregistrer').click();
    fixture.detectChanges();

    const text = element.querySelector('[role="alert"]')?.textContent ?? '';
    expect(text).toContain('BV doit être un entier entre 1 et 10, ou rester vide.');
    expect(text).toContain('TC doit être un entier entre 1 et 10');
    expect(element.querySelector('input[aria-label="BV"]')?.getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(host.saved).toEqual([]);
  });

  it('sends only what changed: the changed values and title', () => {
    const { fixture, host, type, button } = render(F1);
    type('JS', '10');
    type('Titre', 'Autre titre');
    type('TC', '');

    button('Enregistrer').click();
    fixture.detectChanges();

    expect(host.saved).toEqual([
      { baseVersion: 2, title: 'Autre titre', criteria: { js: 10, tc: null } },
    ]);
  });

  it('compares with the feature as it was when the edit began, not with the live state', () => {
    const { fixture, host, type, button } = render(F1);
    type('TC', '6');

    // Un autre poste fait passer BV de 8 à 9 pendant la saisie : ce n'est pas une modification de l'animateur.
    host.feature.set({ ...F1, version: 3, criteria: { ...F1.criteria, bv: 9 } });
    fixture.detectChanges();
    button('Enregistrer').click();

    expect(host.saved).toEqual([{ baseVersion: 2, criteria: { tc: 6 } }]);
  });

  it('sends nothing, and cancels, when nothing changed', () => {
    const { fixture, host, button } = render(F1);

    button('Enregistrer').click();
    fixture.detectChanges();

    expect(host.saved).toEqual([]);
    expect(host.cancelled).toBe(1);
  });

  it('cancels', () => {
    const { host, button } = render(F1);
    button('Annuler').click();
    expect(host.cancelled).toBe(1);
  });

  it('asks for a confirmation before removing, and can back out', () => {
    const { fixture, host, element, button } = render(F1);
    expect(button('Supprimer')).toBeDefined();

    button('Supprimer').click();
    fixture.detectChanges();
    expect(element.querySelector('.confirm')?.textContent).toBe('Supprimer F-1 ?');
    expect(host.removed).toBe(0);

    button('Annuler').click();
    fixture.detectChanges();
    expect(element.querySelector('.confirm')).toBeNull();

    button('Supprimer').click();
    fixture.detectChanges();
    button('Confirmer la suppression').click();
    expect(host.removed).toBe(1);
  });

  it('offers no removal for a new line', () => {
    const { element } = render(null);
    expect(
      [...element.querySelectorAll('button')].some((b) => b.textContent?.includes('Supprimer')),
    ).toBe(false);
  });
});
