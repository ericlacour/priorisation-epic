import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Feature } from '../api/session-state';
import { F1, WSJF, feature } from '../testing/fixtures';
import {
  FeatureDetailPanelComponent,
  ReviewChange,
  TextEdit,
} from './feature-detail-panel.component';

describe('FeatureDetailPanelComponent', () => {
  function render(options: { feature?: Feature; animate?: boolean; stale?: boolean } = {}) {
    const fixture = TestBed.createComponent(FeatureDetailPanelComponent);
    fixture.componentRef.setInput('feature', options.feature ?? F1);
    fixture.componentRef.setInput('definition', WSJF);
    fixture.componentRef.setInput('canAnimate', options.animate ?? false);
    fixture.componentRef.setInput('stale', options.stale ?? false);
    const saved: TextEdit[] = [];
    const reviews: ReviewChange[] = [];
    const log = { closed: 0, overwrite: 0, dismissed: 0, method: 0 };
    const c = fixture.componentInstance;
    c.textSaved.subscribe((edit) => saved.push(edit));
    c.review.subscribe((change) => reviews.push(change));
    c.closed.subscribe(() => log.closed++);
    c.overwrite.subscribe(() => log.overwrite++);
    c.staleDismissed.subscribe(() => log.dismissed++);
    c.methodRequested.subscribe(() => log.method++);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = (text: string) =>
      [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes(text),
      );
    const type = (selector: string, value: string) => {
      const input = element.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    return { fixture, element, saved, reviews, log, button, type };
  }

  it('shows the id, the rank, the full description and the title', () => {
    const { element } = render();
    expect(element.querySelector('.panel-head .muted')?.textContent).toContain('F-1 · rang 1');
    expect(element.querySelector('h2')?.textContent).toBe('Paiement en un clic');
    expect(element.querySelector('.description')?.textContent).toBe(
      'Permettre le paiement sans ressaisir la carte.\nSecond paragraphe.',
    );
    expect(element.querySelector('[role="dialog"]')?.getAttribute('aria-labelledby')).toBe(
      'detail-title',
    );
  });

  it('says so when there is no description or no rank', () => {
    const { element } = render({ feature: feature({ id: 'x', externalId: 'X-1' }) });
    expect(element.querySelector('.description')?.textContent).toBe('Aucun descriptif.');
    expect(element.querySelector('.panel-head .muted')?.textContent).toContain('non classée');
    expect(element.textContent).toContain('Calcul impossible');
  });

  it('shows the retained values with the full names and the calculation exactly as sent', () => {
    const { element } = render();
    expect(element.querySelector('.explanation')?.textContent).toBe(
      'CoD = 8 + 5 + 3 = 16 ; WSJF = 16 / 4 = 4,00',
    );
    expect(element.querySelectorAll('.values li')).toHaveLength(4);
    expect(element.querySelector('.values li')?.textContent).toContain('Business Value');
  });

  it('hides the values and the calculation while the server masks them (open round)', () => {
    const { element } = render({
      feature: feature({
        id: 'm',
        externalId: 'M-1',
        votingInProgress: true,
        criteria: null,
        score: null,
      }),
    });
    expect(element.querySelector('.values')).toBeNull();
    expect(element.querySelector('.explanation')).toBeNull();
    expect(element.textContent).not.toContain('Détail du calcul');
  });

  it('marks a value outside the scale', () => {
    const { element } = render({
      feature: feature({
        id: 'o',
        externalId: 'O-1',
        criteria: { bv: 13 },
        score: {
          complete: false,
          outOfScale: ['bv'],
          computed: null,
          explanation: null,
          rank: null,
        },
      }),
    });
    expect(element.querySelector('.values li.review')?.textContent).toContain('13');
    expect(element.querySelectorAll('.values li')[1].textContent).toContain('—');
  });

  it('shows the review badge with its reason', () => {
    const { element } = render({
      feature: { ...F1, markedForReview: true, reviewReason: 'À compléter' },
    });
    expect(element.querySelector('.badge.review')?.getAttribute('title')).toBe('À compléter');
  });

  it('offers no editing action to a participant', () => {
    const { button } = render({ animate: false });
    expect(button('Modifier le titre et le descriptif')).toBeUndefined();
    expect(button('Marquer à revoir')).toBeUndefined();
  });

  it('puts the facilitator actions at the top, right under the title', () => {
    const { element, button } = render({ animate: true });
    const actions = element.querySelector('.panel-head + .actions')!;
    expect(actions.contains(button('Modifier le titre et le descriptif')!)).toBe(true);
    expect(actions.contains(button('Marquer à revoir')!)).toBe(true);
    const description = element.querySelector('.description')!;
    expect(
      actions.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('asks for the full method from the calculation', () => {
    const { button, log } = render();
    button('Voir la méthode complète')!.click();
    expect(log.method).toBe(1);
  });

  it('closes with the cross, Escape and a click outside', () => {
    const { element, log } = render();
    element.querySelector<HTMLButtonElement>('.panel-close')!.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    element.querySelector<HTMLButtonElement>('[data-testid="panel-backdrop"]')!.click();
    expect(log.closed).toBe(3);
  });

  // --- Mode édition --------------------------------------------------------------------------------

  it('edits the title and the description and sends them in one single intent', () => {
    const { fixture, element, saved, button, type } = render({ animate: true });

    button('Modifier le titre et le descriptif')!.click();
    fixture.detectChanges();
    expect(element.querySelector<HTMLInputElement>('#detail-title-input')!.value).toBe(
      'Paiement en un clic',
    );
    type('#detail-title-input', '  Paiement express ');
    type('#detail-description-input', 'Sans ressaisie.');
    button('Enregistrer')!.click();

    expect(saved).toEqual([
      { baseVersion: F1.version, title: 'Paiement express', description: 'Sans ressaisie.' },
    ]);
  });

  it('sends the version from the start of the edit, not the one received meanwhile', () => {
    const { fixture, saved, button, type } = render({ animate: true });
    button('Modifier le titre et le descriptif')!.click();
    fixture.detectChanges();
    fixture.componentRef.setInput('feature', { ...F1, title: 'Titre d’un autre', version: 9 });
    fixture.detectChanges();
    type('#detail-title-input', 'Ma version');

    button('Enregistrer')!.click();

    expect(saved[0].baseVersion).toBe(F1.version);
  });

  it('closes the edit without sending anything when nothing changed', () => {
    const { fixture, element, saved, button } = render({ animate: true });
    button('Modifier le titre et le descriptif')!.click();
    fixture.detectChanges();

    button('Enregistrer')!.click();
    fixture.detectChanges();

    expect(saved).toEqual([]);
    expect(element.querySelector('#detail-title-input')).toBeNull();
  });

  it('sends a blank description as « no description »', () => {
    const { fixture, saved, button, type } = render({ animate: true });
    button('Modifier le titre et le descriptif')!.click();
    fixture.detectChanges();
    type('#detail-description-input', '   ');

    button('Enregistrer')!.click();

    expect(saved[0].description).toBeNull();
  });

  it('cancels without sending anything and restores the content', () => {
    const { fixture, element, saved, button, type } = render({ animate: true });
    button('Modifier le titre et le descriptif')!.click();
    fixture.detectChanges();
    type('#detail-title-input', 'Autre');

    button('Annuler')!.click();
    fixture.detectChanges();

    expect(saved).toEqual([]);
    expect(element.querySelector('h2')?.textContent).toBe('Paiement en un clic');
    expect(element.querySelector('#detail-title-input')).toBeNull();
  });

  it('refuses an empty title or a description above 5 000 characters', () => {
    const { fixture, element, saved, button, type } = render({ animate: true });
    button('Modifier le titre et le descriptif')!.click();
    fixture.detectChanges();

    type('#detail-title-input', '  ');
    button('Enregistrer')!.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('titre est obligatoire');

    type('#detail-title-input', 'Titre');
    type('#detail-description-input', 'x'.repeat(5001));
    button('Enregistrer')!.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('5 000 caractères');
    expect(saved).toEqual([]);
  });

  it('confirms the saved change once the server sends the new version', () => {
    const { fixture, element, button, type } = render({ animate: true });
    button('Modifier le titre et le descriptif')!.click();
    fixture.detectChanges();
    type('#detail-title-input', 'Paiement express');
    button('Enregistrer')!.click();
    fixture.detectChanges();
    expect(element.querySelector('#detail-title-input')).not.toBeNull();

    fixture.componentRef.setInput('feature', { ...F1, title: 'Paiement express', version: 3 });
    fixture.detectChanges();

    expect(element.querySelector('[role="status"]')?.textContent).toBe(
      'Modification enregistrée et visible par tous les participants',
    );
    expect(element.querySelector('h2')?.textContent).toBe('Paiement express');
  });

  it('shows the current version after a stale refusal and lets the facilitator keep it or overwrite', () => {
    const { fixture, element, log, button, type } = render({ animate: true });
    button('Modifier le titre et le descriptif')!.click();
    fixture.detectChanges();
    type('#detail-title-input', 'Ma version');
    button('Enregistrer')!.click();
    fixture.componentRef.setInput('feature', { ...F1, title: 'Version d’un autre', version: 3 });
    fixture.componentRef.setInput('stale', true);
    fixture.detectChanges();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Version d’un autre');
    expect(element.querySelector('#detail-title-input')).not.toBeNull();
    expect(element.querySelector('[role="status"]')).toBeNull();

    button('Enregistrer quand même')!.click();
    expect(log.overwrite).toBe(1);

    button('Garder la version actuelle')!.click();
    fixture.detectChanges();
    expect(log.dismissed).toBe(1);
    expect(element.querySelector('#detail-title-input')).toBeNull();
  });

  // --- Marque « à revoir » -------------------------------------------------------------------------

  it('marks the feature for review with an optional reason of at most 200 characters', () => {
    const { fixture, reviews, button, type } = render({ animate: true });

    button('Marquer à revoir')!.click();
    fixture.detectChanges();
    type('#detail-reason', 'x'.repeat(250));
    button('Marquer')!.click();

    expect(reviews).toEqual([{ marked: true, reason: 'x'.repeat(200) }]);
  });

  it('marks without a reason', () => {
    const { fixture, reviews, button } = render({ animate: true });
    button('Marquer à revoir')!.click();
    fixture.detectChanges();
    button('Marquer')!.click();
    expect(reviews).toEqual([{ marked: true, reason: null }]);
  });

  it('removes the mark', () => {
    const { reviews, button } = render({
      animate: true,
      feature: { ...F1, markedForReview: true, reviewReason: 'x' },
    });
    expect(button('Marquer à revoir')).toBeUndefined();
    button('Retirer la marque')!.click();
    expect(reviews).toEqual([{ marked: false, reason: null }]);
  });
});
