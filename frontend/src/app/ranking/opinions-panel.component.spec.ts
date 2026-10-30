import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ActiveRankingRoom } from '../api/contract';
import { rankingRoom } from '../testing/fixtures';
import { OpinionsPanelComponent } from './opinions-panel.component';
import { roomGaps } from './opinions';

const ALLOWED = [1, 2, 3, 5, 8, 13, 20];

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
    fixture.componentRef.setInput('gaps', roomGaps(room, ALLOWED));
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

  it('no longer shows the ranking according to the room', () => {
    const { element } = render(room);
    expect(element.querySelector('app-room-ranking')).toBeNull();
    expect(element.textContent).not.toContain('Classement selon la salle');
  });

  it('puts the cards with the widest gap first, tinted by how wide it is', () => {
    const { element } = render({
      ...room,
      opinions: [
        ...room.opinions,
        // F-3 : 5 → 1, trois crans, et F-1 : 8 monté et descendu.
        { featureId: 'f3', criterionKey: 'bv', participantId: 'p3', opinion: 'LOWER', value: 1 },
        { featureId: 'f1', criterionKey: 'bv', participantId: 'p2', opinion: 'LOWER' },
        { featureId: 'f1', criterionKey: 'bv', participantId: 'p4', opinion: 'RAISE' },
      ],
    });
    const cards = [...element.querySelectorAll<HTMLElement>('.opinion-card')];
    expect(cards.map((c) => c.querySelector('.fid')?.textContent?.trim())).toEqual([
      'F-3',
      'F-1',
      'F-2',
    ]);
    expect(cards.map((c) => c.dataset['gap'] ?? null)).toEqual(['strong', 'strong', null]);
    expect(cards[0]!.querySelector('.opinion-gap')?.textContent?.trim()).toBe('Écart 1 ↔ 5');
    expect(cards[1]!.querySelector('.opinion-gap')?.getAttribute('title')).toContain(
      'd’autres la descendraient',
    );
    expect(cards[2]!.querySelector('.opinion-gap')).toBeNull();
    expect(element.textContent).toContain('Je descendrais à 1');
  });

  it('no longer flags a card whose discussion is over for the current criterion', () => {
    const raised = {
      ...room,
      opinions: [
        { featureId: 'f2', criterionKey: 'bv', participantId: 'p2', opinion: 'RAISE', value: 13 },
      ],
    } satisfies ActiveRankingRoom;
    expect(roomGaps(raised, ALLOWED).get('f2')?.level).toBe('notable');
    expect(
      roomGaps({ ...raised, discussed: [{ featureId: 'f2', criterionKey: 'bv' }] }, ALLOWED).size,
    ).toBe(0);
    expect(
      roomGaps({ ...raised, discussed: [{ featureId: 'f2', criterionKey: 'js' }] }, ALLOWED).size,
    ).toBe(1);
  });

  it('flags a notable gap of two steps', () => {
    const { element } = render({
      ...room,
      opinions: [
        { featureId: 'f2', criterionKey: 'bv', participantId: 'p2', opinion: 'RAISE', value: 13 },
      ],
    });
    const card = element.querySelector<HTMLElement>('.opinion-card')!;
    expect(card.dataset['gap']).toBe('notable');
    expect(card.querySelector('.opinion-gap')?.textContent?.trim()).toBe('Écart 5 ↔ 13');
  });

  it('opens the description from the identifier', () => {
    const fixture = TestBed.createComponent(OpinionsPanelComponent);
    fixture.componentRef.setInput('room', room);
    fixture.componentRef.setInput('items', ITEMS);
    fixture.componentRef.setInput('names', NAMES);
    const opened: string[] = [];
    fixture.componentInstance.detailRequested.subscribe((id) => opened.push(id));
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.fid')!.click();
    expect(opened).toEqual(['f2']);
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
    click(spotlight, 'Terminer sans accord');
    expect(spotlights).toEqual([null]);
  });

  it('settles the card under discussion or a card to move with « Accord trouvé »', () => {
    const fixture = TestBed.createComponent(OpinionsPanelComponent);
    fixture.componentRef.setInput('room', { ...room, spotlightFeatureId: 'f3' });
    fixture.componentRef.setInput('items', ITEMS);
    fixture.componentRef.setInput('names', NAMES);
    const settled: { id: string; agreed: boolean }[] = [];
    fixture.componentInstance.settle.subscribe((s) => settled.push(s));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    for (const card of element.querySelectorAll('.opinion-card')) {
      [...card.querySelectorAll<HTMLButtonElement>('button')]
        .find((b) => b.textContent?.trim() === '✓ Accord trouvé')!
        .click();
    }
    expect(settled).toEqual([
      { id: 'f3', agreed: true },
      { id: 'f2', agreed: true },
    ]);
  });

  it('lists the agreements of the current criterion, each one can be reopened', () => {
    const fixture = TestBed.createComponent(OpinionsPanelComponent);
    fixture.componentRef.setInput('room', {
      ...room,
      agreed: [
        { featureId: 'f3', criterionKey: 'bv' },
        { featureId: 'f1', criterionKey: 'js' },
      ],
    });
    fixture.componentRef.setInput('items', ITEMS);
    fixture.componentRef.setInput('names', NAMES);
    const settled: { id: string; agreed: boolean }[] = [];
    fixture.componentInstance.settle.subscribe((s) => settled.push(s));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const list = element.querySelector('.agreed-list')!;
    expect(list.querySelectorAll('li')).toHaveLength(1);
    expect(list.textContent).toContain('F-3');
    expect(list.textContent).toContain('✓ Accord');
    list
      .querySelector<HTMLButtonElement>('button[aria-label="Rouvrir la discussion sur F-3"]')!
      .click();
    expect(settled).toEqual([{ id: 'f3', agreed: false }]);
  });
});
