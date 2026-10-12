import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { SessionApi, SessionApiError } from '../../api/session-api';
import { MESSAGES } from '../../i18n/messages.fr';
import { BrowserStorage } from '../../storage/browser-storage';

/**
 * Écran d'entrée dans une session (écran 3 des maquettes, FR-002, FR-003) : un pseudo, un rôle facultatif,
 * `POST /participants`. Pseudo déjà utilisé : message qui invite à en choisir un autre. Le jeton obtenu est rangé
 * dans le navigateur (`pe.token.{sessionId}`), puis `joined` est émis.
 */
@Component({
  selector: 'app-join',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page narrow">
      <form class="card" (submit)="join($event)" novalidate>
        <h1>{{ messages.title }}</h1>
        @if (sessionName(); as name) {
          <p class="lead">{{ name }}</p>
        }
        @if (takingOver()) {
          <p class="notice info">{{ messages.animationNote }}</p>
        }
        <div class="field">
          <label for="join-pseudo">{{ messages.pseudoLabel }}</label>
          <input
            id="join-pseudo"
            class="input"
            type="text"
            maxlength="40"
            autocomplete="nickname"
            [class.error]="!!error()"
            [attr.aria-invalid]="error() ? 'true' : null"
            [attr.aria-describedby]="error() ? 'join-error' : null"
            [value]="pseudo()"
            (input)="pseudo.set(valueOf($event))"
          />
          @if (error(); as text) {
            <span class="err" id="join-error" role="alert">{{ text }}</span>
          }
        </div>
        <div class="field">
          <label for="join-role">{{ messages.roleLabel }}</label>
          <select
            id="join-role"
            class="input"
            [value]="role()"
            (change)="role.set(valueOf($event))"
          >
            <option value="">{{ messages.roleNone }}</option>
            @for (option of messages.roles; track option) {
              <option [value]="option">{{ option }}</option>
            }
          </select>
        </div>
        <button type="submit" class="btn btn-primary" [disabled]="busy()">
          {{ busy() ? messages.joining : messages.submit }}
        </button>
        <p class="muted small">{{ messages.noAccount }}</p>
      </form>
    </main>
  `,
})
export class JoinComponent implements OnInit {
  private readonly api = inject(SessionApi);
  private readonly storage = inject(BrowserStorage);
  protected readonly messages = MESSAGES.join;

  readonly sessionId = input.required<string>();
  /** Vrai quand un lien d'animation a été ouvert dans ce navigateur : l'arrivant reprend l'animation. */
  readonly takingOver = input(false);
  readonly joined = output<void>();
  /** La session n'existe pas (404 en la consultant). */
  readonly notFound = output<void>();

  protected readonly pseudo = signal(this.storage.readPseudo() ?? '');
  protected readonly role = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly sessionName = signal<string | null>(null);

  ngOnInit(): void {
    this.api.getSession(this.sessionId()).then(
      (state) => this.sessionName.set(state.name),
      (e: unknown) => {
        if (e instanceof SessionApiError && e.kind === 'notFound') this.notFound.emit();
      },
    );
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async join(event: Event): Promise<void> {
    event.preventDefault();
    const pseudo = this.pseudo().trim();
    if (pseudo === '') {
      this.error.set(this.messages.pseudoRequired);
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const response = await this.api.joinSession(this.sessionId(), {
        pseudo,
        ...(this.role() ? { businessRole: this.role() } : {}),
      });
      this.storage.saveToken(this.sessionId(), response.participantToken);
      this.storage.savePseudo(pseudo);
      this.joined.emit();
    } catch (e) {
      this.error.set(this.errorText(e));
    } finally {
      this.busy.set(false);
    }
  }

  private errorText(e: unknown): string {
    if (!(e instanceof SessionApiError)) return this.messages.network;
    switch (e.kind) {
      case 'pseudoTaken':
        return this.messages.pseudoTaken;
      case 'invalid':
        return e.detail ?? this.messages.pseudoRequired;
      case 'notFound':
        this.notFound.emit();
        return MESSAGES.sessionEntry.notFoundTitle;
      default:
        return this.messages.network;
    }
  }
}
