import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { StatusAction } from '../api/contract';
import { MESSAGES } from '../i18n/messages.fr';
import { ModalComponent } from '../shared/modal.component';
import { SessionRoomService } from './session-room.service';

/**
 * Groupe « cycle de vie » de la barre d'actions de l'animateur (FR-014c), à droite : un seul bouton selon le statut,
 * « Démarrer la session », « Clôturer la session » ou « Rouvrir la session » (FR-004). La clôture demande une
 * confirmation ; « Annuler » n'envoie rien. Session clôturée : le bandeau « Session clôturée : lecture seule »
 * accompagne « Rouvrir la session », seule action restante.
 */
@Component({
  selector: 'app-session-status',
  imports: [ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'session-status' },
  template: `
    @if (room.closed()) {
      <p class="action-info">
        <span class="ico" aria-hidden="true">i</span>
        <span>{{ boardMessages.closedBanner }}</span>
      </p>
    }
    <div
      class="action-group lifecycle"
      role="group"
      [attr.aria-label]="boardMessages.groups.lifecycle"
    >
      @switch (status()) {
        @case ('PREPARATION') {
          <button
            type="button"
            class="btn btn-secondary"
            [attr.title]="messages.startHint"
            [disabled]="disabled()"
            (click)="send('START')"
          >
            {{ messages.start }}
          </button>
        }
        @case ('IN_PROGRESS') {
          <button
            type="button"
            class="btn btn-secondary"
            [attr.title]="messages.closeHint"
            [disabled]="disabled()"
            (click)="confirming.set(true)"
          >
            {{ messages.close }}
          </button>
        }
        @case ('CLOSED') {
          <button
            type="button"
            class="btn btn-primary"
            [attr.title]="messages.reopenHint"
            [disabled]="disabled()"
            (click)="send('REOPEN')"
          >
            {{ messages.reopen }}
          </button>
        }
      }
    </div>
    @if (confirming()) {
      <app-modal labelledBy="close-session-title" (closed)="confirming.set(false)">
        <h2 id="close-session-title">{{ messages.confirmTitle }}</h2>
        <p>{{ messages.confirmText }}</p>
        @if (disabled()) {
          <p class="notice danger" role="status">{{ reconnecting }}</p>
        }
        <div class="actions end">
          <button type="button" class="btn btn-secondary" (click)="confirming.set(false)">
            {{ messages.cancel }}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="disabled()"
            (click)="confirmClose()"
          >
            {{ messages.confirmYes }}
          </button>
        </div>
      </app-modal>
    }
  `,
})
export class SessionStatusComponent {
  protected readonly room = inject(SessionRoomService);
  protected readonly messages = MESSAGES.sessionStatus;
  protected readonly boardMessages = MESSAGES.board;
  protected readonly reconnecting = MESSAGES.connection.reconnecting;

  /** Statut inconnu tant qu'aucun état n'est reçu : aucun bouton, plutôt qu'un « Démarrer » peut-être faux. */
  protected readonly status = computed(() => this.room.state()?.status ?? null);
  /** Sans connexion, rien ne peut partir : le bouton attend la reconnexion. */
  protected readonly disabled = computed(() => this.room.connection() !== 'open');
  protected readonly confirming = signal(false);

  /** La confirmation ne se ferme que si la clôture est partie : sinon elle reste ouverte, avec la reconnexion. */
  protected confirmClose(): void {
    if (this.send('CLOSE')) this.confirming.set(false);
  }

  protected send(action: StatusAction): boolean {
    return this.room.changeStatus(action);
  }
}
