import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActiveRankingRoom, RankingDraft } from '../api/contract';
import { SessionRoomService } from '../session/session-room.service';
import { DRAFT_INTERVAL_MS, RankingRoomService } from './ranking-room.service';

const draft = (criterionKey: string, levels: string[][]): RankingDraft => ({
  criterionKeys: ['bv', 'js'],
  criterionKey,
  levels,
  unranked: [],
  values: {},
});

describe('RankingRoomService', () => {
  const sent: unknown[] = [];
  const ended: string[] = [];
  const rankingRoom = signal<ActiveRankingRoom | null>(null);
  const connection = signal<'connecting' | 'open' | 'lost'>('open');
  let connected = true;
  let service: RankingRoomService;

  beforeEach(() => {
    vi.useFakeTimers();
    sent.length = 0;
    ended.length = 0;
    connected = true;
    rankingRoom.set(null);
    connection.set('open');
    TestBed.configureTestingModule({
      providers: [
        RankingRoomService,
        {
          provide: SessionRoomService,
          useValue: {
            rankingRoom,
            connection,
            sendRankingDraft: (d: RankingDraft | null) => {
              if (connected) sent.push(d);
              return connected;
            },
            endRanking: (outcome: string) => ended.push(outcome),
          },
        },
      ],
    });
    service = TestBed.inject(RankingRoomService);
    TestBed.tick();
  });

  afterEach(() => vi.useRealTimers());

  it('sends the first draft at once, then at most one every 200 ms, the latest only', () => {
    service.publish(draft('bv', [['a']]));
    service.publish(draft('bv', [['b']]));
    service.publish(draft('bv', [['c']]));
    expect(sent).toEqual([draft('bv', [['a']])]);

    vi.advanceTimersByTime(DRAFT_INTERVAL_MS);
    expect(sent).toEqual([draft('bv', [['a']]), draft('bv', [['c']])]);
  });

  it('does not send the same draft twice', () => {
    service.publish(draft('bv', [['a']]));
    vi.advanceTimersByTime(DRAFT_INTERVAL_MS);
    service.publish(draft('bv', [['a']]));
    vi.advanceTimersByTime(DRAFT_INTERVAL_MS);
    expect(sent).toHaveLength(1);
  });

  it('pauses the broadcast and resumes it with the current draft', () => {
    service.publish(draft('bv', [['a']]));
    service.setLive(false);
    expect(service.live()).toBe(false);
    expect(sent.at(-1)).toBeNull();

    service.publish(draft('js', [['b']]));
    vi.advanceTimersByTime(DRAFT_INTERVAL_MS);
    expect(sent).toHaveLength(2);

    service.setLive(true);
    expect(sent.at(-1)).toEqual(draft('js', [['b']]));
  });

  it('pausing before anything was broadcast sends nothing', () => {
    service.setLive(false);
    expect(sent).toEqual([]);
  });

  it('closes the room only once something was broadcast', () => {
    service.end('CANCELLED');
    expect(ended).toEqual([]);

    service.publish(draft('bv', [['a']]));
    service.end('SAVED');
    service.end('SAVED');
    expect(ended).toEqual(['SAVED']);
  });

  it('reopens the room when the connection comes back after it was lost', () => {
    service.publish(draft('bv', [['a']]));
    rankingRoom.set({
      type: 'rankingRoom',
      active: true,
      facilitatorId: 'eric',
      live: true,
      draft: draft('bv', [['a']]),
      opinions: [],
      spotlightFeatureId: null,
      discussed: [],
      agreed: [],
    });
    TestBed.tick();
    connection.set('lost');
    rankingRoom.set(null);
    TestBed.tick();
    connection.set('open');
    TestBed.tick();

    expect(sent).toEqual([draft('bv', [['a']]), draft('bv', [['a']])]);
  });
});
