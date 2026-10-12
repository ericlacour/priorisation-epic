import { vi } from 'vitest';

import { Feature } from '../api/contract';
import { IntentResult } from '../session/session-state.service';

/** Remplaçant de `SessionStateService` pour les tests des composants : les intentions sont des espions. */
export function sessionStub(features: readonly Feature[] = []) {
  const ok: IntentResult = { ok: true };
  return {
    addFeature: vi.fn(async (): Promise<IntentResult> => ok),
    updateFeature: vi.fn(async (): Promise<IntentResult> => ok),
    deleteFeature: vi.fn(async (): Promise<IntentResult> => ok),
    startSession: vi.fn(async (): Promise<IntentResult> => ok),
    openRound: vi.fn(async (): Promise<IntentResult> => ok),
    castVote: vi.fn(async (): Promise<IntentResult> => ok),
    revealRound: vi.fn(async (): Promise<IntentResult> => ok),
    transferFacilitator: vi.fn(async (): Promise<IntentResult> => ok),
    feature: vi.fn((id: string): Feature | null => features.find((f) => f.id === id) ?? null),
  };
}

export type SessionStub = ReturnType<typeof sessionStub>;
