import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';

import { RankingDraft } from '../api/contract';
import { SessionRoomService } from '../session/session-room.service';

/** Au plus un brouillon diffusé toutes les 200 ms (FR-015b) : seul le dernier état part. */
export const DRAFT_INTERVAL_MS = 200;

/**
 * Diffusion du classement de l'animateur (FR-015b), fournie par l'écran « Prioriser par classement ». Chaque brouillon
 * part aussitôt s'il n'en est pas parti depuis 200 ms, sinon à la fin de ce délai, et seul le dernier compte. La pause
 * garde chez les membres le dernier brouillon diffusé ; la reprise renvoie l'état courant. Rien n'est enregistré :
 * les valeurs partent avec « Terminer », comme avant. Si la salle s'est fermée sans l'animateur (connexion perdue),
 * elle est rouverte dès que la connexion revient.
 */
@Injectable()
export class RankingRoomService {
  private readonly room = inject(SessionRoomService);

  private readonly liveSignal = signal(true);
  /** Vrai tant que les membres suivent le classement en direct ; faux pendant la pause. */
  readonly live = this.liveSignal.asReadonly();

  private latest: RankingDraft | null = null;
  private lastSent: string | null = null;
  private lastSentAt = Number.NEGATIVE_INFINITY;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private started = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    effect(() => {
      const closed = this.room.rankingRoom() === null;
      const open = this.room.connection() === 'open';
      untracked(() => {
        if (closed && open && this.started && this.liveSignal()) {
          this.lastSent = null;
          this.flush();
        }
      });
    });
  }

  /** Le brouillon courant de l'écran de classement. */
  publish(draft: RankingDraft): void {
    this.latest = draft;
    if (!this.liveSignal()) return;
    if (this.timer !== undefined) return;
    const wait = this.lastSentAt + DRAFT_INTERVAL_MS - Date.now();
    if (wait <= 0) {
      this.flush();
    } else {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.flush();
      }, wait);
    }
  }

  /** Met en pause (`false`) ou reprend (`true`) la diffusion. */
  setLive(live: boolean): void {
    if (live === this.liveSignal()) return;
    this.liveSignal.set(live);
    if (!live) {
      clearTimeout(this.timer);
      this.timer = undefined;
      if (this.started) this.room.sendRankingDraft(null);
      return;
    }
    this.lastSent = null;
    this.flush();
  }

  /** Ferme la salle : `SAVED` après « Terminer », `CANCELLED` sur « Annuler ». Sans effet si rien n'a été diffusé. */
  end(outcome: 'SAVED' | 'CANCELLED'): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.started) return;
    this.started = false;
    this.room.endRanking(outcome);
  }

  private flush(): void {
    const draft = this.latest;
    if (draft === null) return;
    const text = JSON.stringify(draft);
    if (text === this.lastSent) return;
    if (this.room.sendRankingDraft(draft)) {
      this.started = true;
      this.lastSent = text;
      this.lastSentAt = Date.now();
    }
  }
}
