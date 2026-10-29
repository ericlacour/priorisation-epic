import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { CardOpinion } from '../api/contract';
import { CardOpinionsComponent } from './card-opinions.component';

const NAMES = new Map([
  ['p2', 'Camille'],
  ['p3', 'Léo'],
  ['p4', 'Inès'],
]);

const opinion = (participantId: string, kind: CardOpinion['opinion'], comment?: string) => ({
  featureId: 'f1',
  criterionKey: 'bv',
  participantId,
  opinion: kind,
  ...(comment === undefined ? {} : { comment }),
});

describe('CardOpinionsComponent', () => {
  function render(opinions: readonly CardOpinion[]) {
    const fixture = TestBed.createComponent(CardOpinionsComponent);
    fixture.componentRef.setInput('opinions', opinions);
    fixture.componentRef.setInput('names', NAMES);
    fixture.componentRef.setInput('featureLabel', 'F-1');
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('shows nothing without opinions', () => {
    expect(render([]).element.textContent?.trim()).toBe('');
  });

  it('counts each kind of opinion and the commented ones', () => {
    const { element } = render([
      opinion('p2', 'RAISE', 'Le salon de mars.'),
      opinion('p3', 'RAISE'),
      opinion('p4', 'AGREE'),
    ]);
    const counts = [...element.querySelectorAll('.opinion-count')].map((c) =>
      c.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(counts).toEqual(['✓ 1', '↑ 2', '1']);
    expect(element.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Voir les avis sur F-1',
    );
  });

  it('opens the list of opinions with pseudos and comments, and closes it', () => {
    const { fixture, element } = render([opinion('p2', 'LOWER', 'Après F-3.')]);
    const button = element.querySelector<HTMLButtonElement>('button')!;

    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('.opinion-popover')?.textContent).toContain('Camille');
    expect(element.querySelector('.opinion-popover')?.textContent).toContain('Je descendrais');
    expect(element.querySelector('.opinion-popover q')?.textContent).toBe('Après F-3.');

    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(element.querySelector('.opinion-popover')).toBeNull();
  });
});
