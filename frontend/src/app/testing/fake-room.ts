import { signal } from '@angular/core';
import { vi } from 'vitest';

import { SessionState } from '../api/session-state';
import { IntentRefusal } from '../session/session-room.service';

/** `SessionRoomService` simulé : des signaux à piloter et des intentions à espionner. */
export class FakeRoom {
  readonly state = signal<SessionState | null>(null);
  readonly refusal = signal<IntentRefusal | null>(null);
  readonly connection = signal<'connecting' | 'open' | 'lost'>('open');
  readonly end = signal(null);
  readonly canAnimate = signal(false);
  readonly open = vi.fn();
  readonly addFeature = vi.fn<(message: object) => boolean>(() => true);
  readonly updateFeature = vi.fn<(message: object) => boolean>(() => true);
  readonly deleteFeature = vi.fn<(message: object) => boolean>(() => true);
  readonly clearRefusal = vi.fn(() => this.refusal.set(null));
}
