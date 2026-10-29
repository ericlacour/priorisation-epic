import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ActiveRankingRoom } from '../api/contract';
import { rankingRoom } from '../testing/fixtures';
import { OpinionsPanelComponent } from './opinions-panel.component';

const ITEMS = new Map([
  ['f1', { id: 'f1', externalId: 'F-1', title: 'Paiement en un clic' }],
  ['f2', { id: 'f2', externalId: 'F-2', title: 'Notifications' }],
  ['f3', { id: 'f3', externalId: 'F-3', title: 'Fidélité' }],
]);
const NAMES = new Map([
  ['p2', 'Camille'],
  ['p3', 'Léo'],
]);

describe('OpinionsPanelComponent', () => {
  function render(room: ActiveRankingRoom) {
    const fixture = TestBed.createComponent(OpinionsPanelComponent);
    fixture.componentRef.setInput('room', room);
    fixture.componentRef.setInput('items', ITEMS);
    fixture.componentRef.setInput('names', NAMES);
    const spotlights: (string | null)[] = [];
    const cleared: string[] = [];
    fixture.componentInstance.spotlightChange.subscribe((id) => spotlights.push(id));
    fixture.componentInstance.clear.subscribe((id) => cleared.push(id));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const click = (card: Element, text: string) =>
      [...card.querySelectorAll<HTMLButtonElement>('button')]
        .find((b) => b.textContent?.trim() === text)!
        .click();
    return { element, spotlights, cleared, click };
  }

  const room = rankingRoom({
    draft: {
      criterionKeys: ['bv', 'js'],
      criterionKey: 'bv',
      levels: [['f1'], ['f2', 'f3']],
      unranked: [],
      values: { f1: 8, f2: 5, f3: 5 },
    },
    opinions: [
      { featureId: 'f3', criterionKey: 'bv', participantId: 'p2', opinion: 'LOWER' },
      {
        featureId: 'f2',
        criterionKey: 'bv',
        participantId: 'p2',
        opinion: 'RAISE',
        comment: 'Urgent',
      },
      { featureId: 'f2', criterionKey: 'bv', participantId: 'p3', opinion: 'RAISE' },
      { featureId: 'f1', criterionKey: 'bv', participantId: 'p3', opinion: 'AGREE' },
      { featureId: 'f1', criterionKey: 'js', participantId: 'p2', opinion: 'LOWER' },
    ],
  });

  it('lists the cards to move, most requested first, with their comments', () => {
    const { element } = render(room);
    const titles = [...element.querySelectorAll('.opinion-card-title')].map((t) =>
      t.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(titles).toEqual(['F-2 Notifications', 'F-3 Fidélité']);
    expect(element.textContent).toContain('Urgent');
  });

  it('says when no card is to move', () => {
    const { element } = render(rankingRoom());
    expect(element.textContent).toContain('Aucune carte à déplacer selon la salle.');
  });

  it('puts a card under discussion or clears its opinions', () => {
    const { element, spotlights, cleared, click } = render(room);
    const card = element.querySelector('.opinion-card')!;
    click(card, 'Mettre en discussion');
    click(card, 'Effacer les avis');
    expect(spotlights).toEqual(['f2']);
    expect(cleared).toEqual(['f2']);
  });

  it('shows the card under discussion first, and ends the discussion', () => {
    const { element, spotlights, click } = render({ ...room, spotlightFeatureId: 'f2' });
    const spotlight = element.querySelector('.opinion-card.spotlight')!;
    expect(spotlight.textContent).toContain('F-2');
    expect(
      [...element.querySelectorAll('.opinion-card-title')].map((t) => t.textContent),
    ).toHaveLength(2);
    click(spotlight, 'Terminer la discussion');
    expect(spotlights).toEqual([null]);
  });
});
