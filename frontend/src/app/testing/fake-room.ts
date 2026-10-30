import { computed, signal } from '@angular/core';
import { vi } from 'vitest';

import { ActiveRankingRoom, RankingEndReason } from '../api/contract';
import { SessionState } from '../api/session-state';
import { IntentRefusal } from '../session/session-room.service';

/** `SessionRoomService` simulé : des signaux à piloter et des intentions à espionner. */
export class FakeRoom {
  readonly state = signal<SessionState | null>(null);
  readonly refusal = signal<IntentRefusal | null>(null);
  readonly connection = signal<'connecting' | 'open' | 'lost'>('open');
  readonly end = signal(null);
  readonly canAnimate = signal(false);
  readonly closed = computed(() => this.state()?.status === 'CLOSED');
  readonly canEdit = computed(() => this.canAnimate() && !this.closed());
  readonly open = vi.fn();
  readonly addFeature = vi.fn<(message: object) => boolean>(() => true);
  readonly updateFeature = vi.fn<(message: object) => boolean>(() => true);
  readonly deleteFeature = vi.fn<(message: object) => boolean>(() => true);
  readonly updateSettings = vi.fn<(message: object) => boolean>(() => true);
  readonly changeStatus = vi.fn<(action: string) => boolean>(() => true);
  readonly showReadOnly = vi.fn((state: SessionState) => this.state.set(state));
  readonly facilitatorTokens = vi.fn<
    () => { participantToken: string; animationToken: string } | null
  >(() => ({ participantToken: 'p-token', animationToken: 'a-token' }));
  readonly clearRefusal = vi.fn(() => this.refusal.set(null));
  readonly rankingRoom = signal<ActiveRankingRoom | null>(null);
  readonly rankingEnd = signal<RankingEndReason | null>(null);
  readonly sendRankingDraft = vi.fn<(draft: object | null) => boolean>(() => true);
  readonly endRanking = vi.fn<(outcome: string) => boolean>(() => true);
  readonly giveOpinion = vi.fn<
    (
      featureId: string,
      criterionKey: string,
      opinion: string | null,
      comment?: string,
      value?: number,
    ) => boolean
  >(() => true);
  readonly clearOpinions = vi.fn<(featureId: string, criterionKey: string) => boolean>(() => true);
  readonly setSpotlight = vi.fn<(featureId: string | null) => boolean>(() => true);
  readonly dismissRankingEnd = vi.fn(() => this.rankingEnd.set(null));
}
