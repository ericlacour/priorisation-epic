import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { Feature, SessionState } from '../api/contract';
import { SessionStateService } from '../session/session-state.service';
import { REACH_EFFORT, feature as makeFeature, sessionState } from '../testing/fixtures';
import { SessionStub, sessionStub } from '../testing/session-stub';
import { FeatureEditorComponent } from './feature-editor.component';

@Component({
  imports: [FeatureEditorComponent],
  template: `<table>
    <tbody>
      <tr
        appFeatureEditor
        [state]="state()"
        [feature]="feature()"
        (closed)="closed.set(closed() + 1)"
      ></tr>
    </tbody>
  </table>`,
})
class Host {
  readonly state = signal<SessionState>(sessionState());
  readonly feature = signal<Feature | null>(null);
  readonly closed = signal(0);
}

describe('FeatureEditorComponent', () => {
  let stub: SessionStub;

  beforeEach(() => {
    stub = sessionStub();
  });

  function mount(
    options: { feature?: Feature | null; state?: SessionState; stub?: SessionStub } = {},
  ) {
    stub = options.stub ?? stub;
    TestBed.configureTestingModule({
      providers: [{ provide: SessionStateService, useValue: stub }],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.feature.set(options.feature ?? null);
    if (options.state) fixture.componentInstance.state.set(options.state);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const row = root.querySelector('tr') as HTMLElement;
    return {
      fixture,
      host: fixture.componentInstance,
      row,
      input: (label: string) =>
        row.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement,
      button: (text: string) =>
        Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as
          HTMLButtonElement | undefined,
      errors: () => Array.from(row.querySelectorAll('.err')).map((e) => e.textContent?.trim()),
      async type(label: string, value: string) {
        const field = this.input(label);
        field.value = value;
        field.dispatchEvent(new Event('input'));
        fixture.detectChanges();
      },
      async click(text: string) {
        this.button(text)!.click();
        await fixture.whenStable();
        fixture.detectChanges();
      },
    };
  }

  describe('adding a feature', () => {
    it('has one field per criterion of the method, and shows no computed value yet', () => {
      const { row } = mount();
      expect(
        Array.from(row.querySelectorAll('input')).map((i) => i.getAttribute('aria-label')),
      ).toEqual(['Identifiant de la fonctionnalité', 'Titre', 'BV', 'TC', 'RR/OE', 'JS']);
      expect(
        Array.from(row.querySelectorAll('td.num'))
          .slice(-2)
          .map((c) => c.textContent?.trim()),
      ).toEqual(['—', '—']);
    });

    it('follows the method definition: another method has its own fields (SC-009)', () => {
      const { row } = mount({ state: sessionState({ methodDefinition: REACH_EFFORT }) });
      expect(
        Array.from(row.querySelectorAll('input')).map((i) => i.getAttribute('aria-label')),
      ).toEqual(['Identifiant de la fonctionnalité', 'Titre', 'Portée', 'Effort']);
    });

    it('refuses an empty identifier and title without sending anything', async () => {
      const ui = mount();
      await ui.click('Enregistrer');
      expect(ui.errors()).toEqual([
        'Saisissez un identifiant (50 caractères au plus).',
        'Saisissez un titre (200 caractères au plus).',
      ]);
      expect(ui.input('Titre').getAttribute('aria-invalid')).toBe('true');
      expect(stub.addFeature).not.toHaveBeenCalled();
      expect(ui.host.closed()).toBe(0);
    });

    it.each(['0', '11', '2,5', 'abc'])(
      'refuses the value %s with the allowed range',
      async (value) => {
        const ui = mount();
        await ui.type('Identifiant de la fonctionnalité', 'F-9');
        await ui.type('Titre', 'Neuf');
        await ui.type('JS', value);
        await ui.click('Enregistrer');
        expect(ui.errors()).toEqual(['Le JS doit être un nombre entier entre 1 et 10.']);
        expect(ui.input('JS').getAttribute('aria-invalid')).toBe('true');
        expect(stub.addFeature).not.toHaveBeenCalled();
      },
    );

    it('lists the allowed values on a Fibonacci scale', async () => {
      const ui = mount({
        state: sessionState({
          scale: { type: 'FIBONACCI', max: 13, allowedValues: [1, 2, 3, 5, 8, 13] },
        }),
      });
      await ui.type('Identifiant de la fonctionnalité', 'F-9');
      await ui.type('Titre', 'Neuf');
      await ui.type('BV', '4');
      await ui.click('Enregistrer');
      expect(ui.errors()).toEqual([
        "Le BV doit être l'une des valeurs suivantes : 1, 2, 3, 5, 8, 13.",
      ]);
    });

    it('sends one addFeature with trimmed texts and only the values entered, then closes', async () => {
      const ui = mount();
      await ui.type('Identifiant de la fonctionnalité', '  F-9 ');
      await ui.type('Titre', ' Neuf  ');
      await ui.type('BV', '8');
      await ui.type('JS', ' 3 ');
      await ui.click('Enregistrer');
      expect(stub.addFeature).toHaveBeenCalledOnce();
      expect(stub.addFeature).toHaveBeenCalledWith({
        externalId: 'F-9',
        title: 'Neuf',
        criteria: { bv: 8, tc: null, rrOe: null, js: 3 },
      });
      expect(ui.host.closed()).toBe(1);
    });

    it('sends no criteria when none is entered', async () => {
      const ui = mount();
      await ui.type('Identifiant de la fonctionnalité', 'F-9');
      await ui.type('Titre', 'Neuf');
      await ui.click('Enregistrer');
      expect(stub.addFeature).toHaveBeenCalledWith({
        externalId: 'F-9',
        title: 'Neuf',
        criteria: { bv: null, tc: null, rrOe: null, js: null },
      });
    });

    it('shows the server error and marks the identifier when it already exists', async () => {
      stub.addFeature.mockResolvedValueOnce({ ok: false, code: 'DUPLICATE_EXTERNAL_ID' });
      const ui = mount();
      await ui.type('Identifiant de la fonctionnalité', 'F-1');
      await ui.type('Titre', 'Doublon');
      await ui.click('Enregistrer');
      expect(ui.errors()).toEqual([
        'Cet identifiant existe déjà dans la session : choisissez-en un autre.',
      ]);
      expect(ui.input('Identifiant de la fonctionnalité').getAttribute('aria-invalid')).toBe(
        'true',
      );
      expect(ui.host.closed()).toBe(0);
    });

    it('disables the buttons while the intention is pending, so it is sent once', async () => {
      let release!: () => void;
      stub.addFeature.mockImplementationOnce(
        () => new Promise((resolve) => (release = () => resolve({ ok: true }))),
      );
      const ui = mount();
      await ui.type('Identifiant de la fonctionnalité', 'F-9');
      await ui.type('Titre', 'Neuf');
      ui.button('Enregistrer')!.click();
      ui.fixture.detectChanges();
      expect(ui.button('Enregistrement…')!.disabled).toBe(true);
      expect(ui.button('Annuler')!.disabled).toBe(true);
      ui.row.querySelector<HTMLButtonElement>('.btn-primary')!.click();
      expect(stub.addFeature).toHaveBeenCalledOnce();
      release();
      await ui.fixture.whenStable();
      expect(ui.host.closed()).toBe(1);
    });

    it('saves with Enter in a field', async () => {
      const ui = mount();
      await ui.type('Identifiant de la fonctionnalité', 'F-9');
      await ui.type('Titre', 'Neuf');
      ui.input('Titre').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      await ui.fixture.whenStable();
      expect(stub.addFeature).toHaveBeenCalledOnce();
    });

    it('cancels with Escape', () => {
      const ui = mount();
      ui.row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(ui.host.closed()).toBe(1);
    });

    it('ignores Enter outside a field', async () => {
      const ui = mount();
      ui.row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await ui.fixture.whenStable();
      expect(ui.errors()).toEqual([]);
    });

    it('cancels without sending anything', async () => {
      const ui = mount();
      await ui.click('Annuler');
      expect(ui.host.closed()).toBe(1);
      expect(stub.addFeature).not.toHaveBeenCalled();
    });

    it('has no delete button', () => {
      expect(mount().button('Supprimer')).toBeUndefined();
    });
  });

  describe('editing a feature', () => {
    const existing = makeFeature({ version: 4 });

    it('shows the identifier and prefilled values; the table does not move meanwhile', () => {
      const ui = mount({ feature: existing });
      expect(ui.row.querySelector('b')?.textContent).toBe('F-1');
      expect(ui.input('Identifiant de la fonctionnalité')).toBeNull();
      expect(ui.input('Titre').value).toBe('Paiement en un clic');
      expect(['BV', 'TC', 'RR/OE', 'JS'].map((l) => ui.input(l).value)).toEqual([
        '8',
        '5',
        '3',
        '4',
      ]);
      expect(ui.row.textContent).toContain('16');
      expect(ui.row.textContent).toContain('4,00');
    });

    it('closes without sending when nothing changed', async () => {
      const ui = mount({ feature: existing });
      await ui.click('Enregistrer');
      expect(stub.updateFeature).not.toHaveBeenCalled();
      expect(ui.host.closed()).toBe(1);
    });

    it('sends only what changed, with the version read when it opened', async () => {
      const ui = mount({ feature: existing });
      await ui.type('JS', '10');
      await ui.type('Titre', 'Autre titre');
      await ui.click('Enregistrer');
      expect(stub.updateFeature).toHaveBeenCalledOnce();
      expect(stub.updateFeature).toHaveBeenCalledWith(existing.id, 4, {
        title: 'Autre titre',
        criteria: { js: 10 },
      });
      expect(ui.host.closed()).toBe(1);
    });

    it('clears a value that was emptied', async () => {
      const ui = mount({ feature: existing });
      await ui.type('TC', '');
      await ui.click('Enregistrer');
      expect(stub.updateFeature).toHaveBeenCalledWith(existing.id, 4, { criteria: { tc: null } });
    });

    it('asks for a confirmation before deleting, and can back out', async () => {
      const ui = mount({ feature: existing });
      await ui.click('Supprimer');
      expect(ui.errors()).toEqual([
        'Supprimer F-1 ? Elle disparaîtra du tableau chez tous les participants.',
      ]);
      expect(stub.deleteFeature).not.toHaveBeenCalled();
      const cancel = Array.from(ui.row.querySelectorAll('.editor-messages button')).find(
        (b) => b.textContent?.trim() === 'Annuler',
      ) as HTMLButtonElement;
      cancel.click();
      ui.fixture.detectChanges();
      expect(ui.errors()).toEqual([]);
      expect(ui.host.closed()).toBe(0);
    });

    it('deletes after the confirmation, with the version read', async () => {
      const ui = mount({ feature: existing });
      await ui.click('Supprimer');
      await ui.click('Confirmer la suppression');
      expect(stub.deleteFeature).toHaveBeenCalledWith(existing.id, 4);
      expect(ui.host.closed()).toBe(1);
    });

    it('shows the current value on STALE_VERSION and lets you keep it', async () => {
      const current = makeFeature({ version: 5, criteria: { bv: 8, tc: 5, rrOe: 3, js: 5 } });
      const withCurrent = sessionStub([current]);
      withCurrent.updateFeature.mockResolvedValueOnce({ ok: false, code: 'STALE_VERSION' });
      const ui = mount({ feature: existing, stub: withCurrent });
      await ui.type('JS', '3');
      await ui.click('Enregistrer');
      expect(ui.errors()).toEqual([
        'Cette fonctionnalité a été modifiée ailleurs entre-temps.',
        'JS vaut maintenant 5 (vous aviez saisi 3).',
      ]);
      await ui.click('Garder les valeurs actuelles');
      expect(ui.host.closed()).toBe(1);
      expect(withCurrent.updateFeature).toHaveBeenCalledOnce();
    });

    it('overwrites with the current version when you insist', async () => {
      const current = makeFeature({
        version: 5,
        title: 'Titre ailleurs',
        criteria: { bv: 8, tc: 5, rrOe: 3, js: 5 },
      });
      const withCurrent = sessionStub([current]);
      withCurrent.updateFeature.mockResolvedValueOnce({ ok: false, code: 'STALE_VERSION' });
      const ui = mount({ feature: existing, stub: withCurrent });
      await ui.type('JS', '3');
      await ui.click('Enregistrer');
      expect(ui.errors()).toContain('Le titre est maintenant « Titre ailleurs ».');
      await ui.click('Remplacer par ma saisie');
      expect(withCurrent.updateFeature).toHaveBeenLastCalledWith(existing.id, 5, {
        title: 'Paiement en un clic',
        criteria: { js: 3 },
      });
      expect(ui.host.closed()).toBe(1);
    });

    it('closes when overwriting would change nothing', async () => {
      const current = makeFeature({ version: 5 });
      const withCurrent = sessionStub([current]);
      withCurrent.updateFeature.mockResolvedValueOnce({ ok: false, code: 'STALE_VERSION' });
      const ui = mount({ feature: existing, stub: withCurrent });
      await ui.type('JS', '3');
      await ui.click('Enregistrer');
      await ui.type('JS', '4');
      await ui.click('Remplacer par ma saisie');
      expect(withCurrent.updateFeature).toHaveBeenCalledOnce();
      expect(ui.host.closed()).toBe(1);
    });

    it('explains generically when the current value cannot be found', async () => {
      stub.updateFeature.mockResolvedValueOnce({ ok: false, code: 'STALE_VERSION' });
      const ui = mount({ feature: existing });
      await ui.type('JS', '3');
      await ui.click('Enregistrer');
      expect(ui.errors()).toEqual([
        'Cette fonctionnalité a été modifiée par un autre poste. Vérifiez sa valeur actuelle avant de confirmer.',
      ]);
    });

    it('says the values changed when only something else did', async () => {
      const current = makeFeature({ version: 5 });
      const withCurrent = sessionStub([current]);
      withCurrent.updateFeature.mockResolvedValueOnce({ ok: false, code: 'STALE_VERSION' });
      const ui = mount({ feature: existing, stub: withCurrent });
      await ui.type('JS', '3');
      await ui.click('Enregistrer');
      expect(ui.errors()).toContain(
        'Ses valeurs ont changé : vérifiez le tableau avant de confirmer.',
      );
    });

    it('shows any other server error in French and stays open', async () => {
      stub.updateFeature.mockResolvedValueOnce({ ok: false, code: 'FEATURE_IN_OPEN_ROUND' });
      const ui = mount({ feature: existing });
      await ui.type('JS', '3');
      await ui.click('Enregistrer');
      expect(ui.errors()).toEqual([
        'Cette fonctionnalité est en cours de vote : révélez le tour avant de modifier ses valeurs.',
      ]);
      expect(ui.host.closed()).toBe(0);
    });

    it('shows a dash for an incomplete feature with no rank', () => {
      const ui = mount({
        feature: makeFeature({
          score: null,
          criteria: { bv: null, tc: null, rrOe: null, js: null },
        }),
      });
      expect(ui.row.querySelector('td')?.textContent?.trim()).toBe('—');
    });
  });
});
