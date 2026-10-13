import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';

import { SessionApi, SessionApiError } from '../../api/session-api';
import { MESSAGES } from '../../i18n/messages.fr';
import { BrowserStorage } from '../../storage/browser-storage';

/**
 * Écran d'entrée (FR-002, FR-003) : le pseudo et, facultativement, un rôle métier. Le serveur rend le jeton de
 * participant, rangé dans ce navigateur ; un pseudo déjà pris est refusé avec un message qui dit quoi faire.
 */
@Component({
  selector: 'app-join',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page narrow">
      <form class="card" (submit)="submit($event)" novalidate>
        <h1>{{ messages.title }}</h1>
        <div class="field">
          <label for="join-pseudo">{{ messages.pseudoLabel }}</label>
          <input
            id="join-pseudo"
            class="input"
            [class.error]="error() !== null"
            maxlength="40"
            autocomplete="nickname"
            [value]="pseudo()"
            [attr.aria-invalid]="error() !== null"
            [attr.aria-describedby]="error() ? 'join-error' : null"
            (input)="pseudo.set($any($event.target).value)"
          />
          @if (error(); as text) {
            <span id="join-error" class="err" role="alert">{{ text }}</span>
          }
        </div>
        <div class="field">
          <label for="join-role">{{ messages.roleLabel }}</label>
          <select id="join-role" class="input" (change)="role.set($any($event.target).value)">
            <option value="">{{ messages.noRole }}</option>
            @for (name of messages.roles; track name) {
              <option [value]="name">{{ name }}</option>
            }
          </select>
        </div>
        <button type="submit" class="btn btn-primary" [disabled]="busy()">
          {{ busy() ? messages.submitting : messages.submit }}
        </button>
      </form>
      <p class="muted small">{{ messages.note }}</p>
    </main>
  `,
})
export class JoinComponent {
  private readonly api = inject(SessionApi);
  private readonly storage = inject(BrowserStorage);
  protected readonly messages = MESSAGES.join;

  readonly sessionId = input.required<string>();
  /** Le jeton est rangé : la page peut ouvrir la connexion. */
  readonly joined = output<void>();
  /** La session n'existe pas (404). */
  readonly notFound = output<void>();

  protected readonly pseudo = signal(this.storage.readPseudo() ?? '');
  protected readonly role = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    const pseudo = this.pseudo().trim();
    if (pseudo === '' || [...pseudo].length > 40) {
      this.error.set(this.messages.pseudoRequired);
      return;
    }
    this.error.set(null);
    this.busy.set(true);
    try {
      const role = this.role();
      const { participantToken } = await this.api.joinSession(this.sessionId(), {
        pseudo,
        ...(role === '' ? {} : { businessRole: role }),
      });
      this.storage.saveToken(this.sessionId(), participantToken);
      this.storage.savePseudo(pseudo);
      this.joined.emit();
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  private fail(e: unknown): void {
    const kind = e instanceof SessionApiError ? e.kind : 'network';
    if (kind === 'notFound') {
      this.notFound.emit();
    } else if (kind === 'pseudoTaken') {
      this.error.set(this.messages.pseudoTaken);
    } else {
      this.error.set((e instanceof SessionApiError ? e.detail : null) ?? MESSAGES.apiErrors[kind]);
    }
  }
}
