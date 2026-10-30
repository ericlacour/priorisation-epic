import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistantPreviewService } from '../board/assistant-preview.service';
import { ScreenSizeService } from '../layout/screen-size.service';
import { SessionRoomService } from '../session/session-room.service';
import { FakeRoom } from '../testing/fake-room';
import { rankingRoom, state } from '../testing/fixtures';
import { LiveRankingViewComponent, MOVED_HIGHLIGHT_MS } from './live-ranking-view.component';

describe('LiveRankingViewComponent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function render(phone = false) {
    const room = new FakeRoom();
    room.state.set(state({ me: { participantId: 'p2', pseudo: 'Camille', role: 'PARTICIPANT' } }));
    room.rankingRoom.set(rankingRoom());
    TestBed.configureTestingModule({
      providers: [
        { provide: SessionRoomService, useValue: room },
        { provide: ScreenSizeService, useValue: { isPhone: signal(phone) } },
      ],
    });
    const fixture = TestBed.createComponent(LiveRankingViewComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const row = (id: string) => element.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
    const opinionButton = (id: string, kind: string) =>
      row(id).querySelector<HTMLButtonElement>(`.opinion-buttons [data-opinion="${kind}"]`)!;
    return { room, fixture, element, row, opinionButton };
  }

  it('shows the facilitator ranking read-only, with the criterion and the values', () => {
    const { element, row } = render();
    expect(element.querySelector('h1')?.textContent).toBe('Classement en direct');
    expect(element.textContent).toContain('Éric classe BV · Business Value');
    expect(element.textContent).toContain('Vous suivez le classement de Éric');
    expect(row('f1').closest('.rank-ranked')).not.toBeNull();
    expect(row('f1').querySelector('.live-value')?.textContent).toBe('8');
    expect(row('f2').closest('.rank-unranked')).not.toBeNull();
    expect(row('f2').querySelector('.live-value')?.textContent).toBe('–');
    expect(element.querySelector('input.num-input')).toBeNull();
    expect(element.querySelector('[draggable]')).toBeNull();
  });

  it('gives an opinion with the next value of the scale, then offers an optional comment', () => {
    const { room, fixture, element, opinionButton } = render();

    opinionButton('f1', 'RAISE').click();
    expect(room.giveOpinion).toHaveBeenCalledWith('f1', 'bv', 'RAISE', undefined, 9);
    room.rankingRoom.set(
      rankingRoom({
        opinions: [
          { featureId: 'f1', criterionKey: 'bv', participantId: 'p2', opinion: 'RAISE', value: 9 },
        ],
      }),
    );
    fixture.detectChanges();
    expect(opinionButton('f1', 'RAISE').getAttribute('aria-pressed')).toBe('true');

    const input = element.querySelector<HTMLInputElement>('#opinion-comment')!;
    expect(element.querySelector('.opinion-composer')?.textContent).toContain(
      'Votre avis sur F-1 : ↑ Je monterais',
    );
    input.value = '  Le salon de mars.  ';
    element.querySelector<HTMLFormElement>('.opinion-composer')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(room.giveOpinion).toHaveBeenLastCalledWith('f1', 'bv', 'RAISE', 'Le salon de mars.');
    expect(element.querySelector('.opinion-composer')).toBeNull();
  });

  it('lets the participant say how far to move a card: only values above to raise it', () => {
    const { room, fixture, element, opinionButton } = render();

    opinionButton('f1', 'RAISE').click();
    room.rankingRoom.set(
      rankingRoom({
        opinions: [
          { featureId: 'f1', criterionKey: 'bv', participantId: 'p2', opinion: 'RAISE', value: 9 },
        ],
      }),
    );
    fixture.detectChanges();
    const select = element.querySelector<HTMLSelectElement>('#opinion-value')!;
    expect([...select.options].map((o) => o.value)).toEqual(['9', '10']);
    expect(select.value).toBe('9');

    select.value = '10';
    select.dispatchEvent(new Event('change'));
    expect(room.giveOpinion).toHaveBeenLastCalledWith('f1', 'bv', 'RAISE', undefined, 10);
  });

  it('no longer shows the ranking according to the room', () => {
    const { room, fixture, element } = render();
    room.rankingRoom.set(
      rankingRoom({
        opinions: [
          { featureId: 'f1', criterionKey: 'bv', participantId: 'p2', opinion: 'LOWER', value: 3 },
        ],
      }),
    );
    fixture.detectChanges();
    expect(element.querySelector('app-room-ranking')).toBeNull();
    expect(element.textContent).not.toContain('Classement selon la salle');
  });

  it('marks an agreed card for the participant, with no opinion button left on it', () => {
    const { room, fixture, row } = render();
    room.rankingRoom.set(rankingRoom({ agreed: [{ featureId: 'f1', criterionKey: 'bv' }] }));
    fixture.detectChanges();
    expect(row('f1').dataset['agreed']).toBe('true');
    expect(row('f1').querySelector('.agreed-badge')?.textContent?.trim()).toBe('✓ Accord');
    expect(row('f1').querySelector('.agreed-badge')?.getAttribute('title')).toContain(
      'on n’y revient pas',
    );
    expect(row('f1').querySelector('.opinion-buttons')).toBeNull();
    expect(row('f2').querySelector('.opinion-buttons')).not.toBeNull();
    expect(row('f2').dataset['agreed']).toBeUndefined();
  });

  it('opens the description of a feature from the live ranking', () => {
    const { fixture, element, row } = render();
    row('f1').querySelector<HTMLButtonElement>('button.fid')!.click();
    fixture.detectChanges();
    expect(element.querySelector('app-feature-detail-panel')).not.toBeNull();
    expect(element.querySelector('#detail-title')?.textContent).toContain('Paiement en un clic');
  });

  it('a comment is never required, and a second click withdraws the opinion', () => {
    const { room, fixture, element, opinionButton } = render();
    room.rankingRoom.set(
      rankingRoom({
        opinions: [{ featureId: 'f1', criterionKey: 'bv', participantId: 'p2', opinion: 'AGREE' }],
      }),
    );
    fixture.detectChanges();

    opinionButton('f1', 'LOWER').click();
    fixture.detectChanges();
    [...element.querySelectorAll<HTMLButtonElement>('.opinion-composer button')]
      .find((b) => b.textContent?.trim() === 'Sans commentaire')!
      .click();
    fixture.detectChanges();
    expect(element.querySelector('.opinion-composer')).toBeNull();

    opinionButton('f1', 'AGREE').click();
    expect(room.giveOpinion).toHaveBeenLastCalledWith('f1', 'bv', null, undefined, undefined);
  });

  it('lists my opinions, to comment or withdraw them', () => {
    const { room, fixture, element } = render();
    room.rankingRoom.set(
      rankingRoom({
        opinions: [
          {
            featureId: 'f1',
            criterionKey: 'bv',
            participantId: 'p2',
            opinion: 'RAISE',
            comment: 'Vite',
          },
          { featureId: 'f1', criterionKey: 'bv', participantId: 'p1', opinion: 'AGREE' },
          { featureId: 'f2', criterionKey: 'js', participantId: 'p2', opinion: 'AGREE' },
        ],
      }),
    );
    fixture.detectChanges();
    const mine = element.querySelector('[aria-labelledby="my-opinions-title"]')!;
    expect(mine.querySelectorAll('.opinion-card')).toHaveLength(1);
    expect(mine.textContent).toContain('Vite');
    [...mine.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.trim() === 'Retirer')!
      .click();
    expect(room.giveOpinion).toHaveBeenCalledWith('f1', 'bv', null, undefined, undefined);
  });

  it('highlights the card under discussion with its opinions', () => {
    const { room, fixture, element, row } = render();
    room.rankingRoom.set(
      rankingRoom({
        spotlightFeatureId: 'f1',
        opinions: [{ featureId: 'f1', criterionKey: 'bv', participantId: 'p1', opinion: 'AGREE' }],
      }),
    );
    fixture.detectChanges();
    expect(row('f1').classList).toContain('spotlight');
    expect(element.querySelector('.opinion-card.spotlight')?.textContent).toContain('Éric');
  });

  it('signals the card the facilitator just moved', () => {
    const { room, fixture, row } = render();
    room.rankingRoom.set(
      rankingRoom({
        draft: {
          ...rankingRoom().draft,
          levels: [['f2'], ['f1']],
          unranked: [],
          values: { f2: 8, f1: 7 },
        },
      }),
    );
    fixture.detectChanges();
    expect(row('f2').classList).toContain('just-moved');

    vi.advanceTimersByTime(MOVED_HIGHLIGHT_MS);
    fixture.detectChanges();
    expect(row('f2').classList).not.toContain('just-moved');
  });

  it('lets the participant browse freely, and says when the broadcast is paused', () => {
    const { room, fixture, element } = render();
    const follow = () =>
      [...element.querySelectorAll<HTMLButtonElement>('.live-follow button')][0]!;
    follow().click();
    fixture.detectChanges();
    expect(element.textContent).toContain('Vous parcourez librement');
    expect(follow().textContent?.trim()).toBe('Revenir sur Éric');

    room.rankingRoom.set(rankingRoom({ live: false }));
    fixture.detectChanges();
    expect(element.textContent).toContain('Diffusion en pause');
  });

  it('shows the participant the AI assistant preview on demand, beside their opinions', () => {
    const { fixture, element } = render();
    expect(element.querySelector('app-assistant-panel')).toBeNull();
    element.querySelector<HTMLButtonElement>('.assistant-toggle')!.click();
    fixture.detectChanges();
    const assistant = element.querySelector('app-assistant-panel')!;
    expect(element.querySelector('.ranking-with-room.with-panel.with-assistant')).not.toBeNull();
    expect(assistant.textContent).toContain('Mes avis');
    expect(assistant.textContent).toContain('Proposer une valeur');
    expect(assistant.querySelector('textarea')?.disabled).toBe(true);
  });

  it('never shows the AI assistant preview nor its toggle on a phone', () => {
    const { fixture, element } = render(true);
    TestBed.inject(AssistantPreviewService).toggle();
    fixture.detectChanges();
    expect(element.querySelector('app-assistant-panel')).toBeNull();
    expect(element.querySelector('.assistant-toggle')).toBeNull();
  });

  it('is read-only on a phone, without opinion buttons', () => {
    const { element } = render(true);
    expect(element.querySelector('[data-opinion="AGREE"]:is(button)')).toBeNull();
    expect(element.textContent).toContain('Pour donner votre avis, utilisez un ordinateur.');
  });
});
