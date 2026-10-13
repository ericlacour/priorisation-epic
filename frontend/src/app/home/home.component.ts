import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { CreateSessionResponse } from '../api/contract';
import { SessionApi, SessionApiError } from '../api/session-api';
import { MethodDefinition } from '../api/session-state';
import { MESSAGES } from '../i18n/messages.fr';
import { LinkBoxComponent } from '../shared/link-box.component';
import { MethodPanelComponent } from '../shared/method-panel.component';
import { BrowserStorage } from '../storage/browser-storage';

/**
 * Accueil : création d'une session (FR-001, FR-017d). La méthode se choisit parmi `GET /api/methods` (WSJF par
 * défaut) et ne pourra plus changer. Après la création, les jetons sont rangés dans ce navigateur et les deux liens
 * s'affichent : l'invitation, et le lien d'animation privé « à garder pour vous ».
 */
@Component({
  selector: 'app-home',
  imports: [LinkBoxComponent, MethodPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (created(); as created) {
      <main class="page narrow">
        <h1>{{ createdMessages.title }}</h1>
        <p class="notice success" role="status">{{ createdMessages.ready }}</p>
        <section class="card">
          <h2>{{ createdMessages.inviteTitle }}</h2>
          <p class="muted small">{{ createdMessages.inviteHelp }}</p>
          <app-link-box [url]="inviteUrl()" />
        </section>
        <section class="secret">
          <h2>{{ createdMessages.animationTitle }}</h2>
          <p class="small">
            <strong>{{ createdMessages.animationWarning }}</strong>
            {{ createdMessages.animationHelp }}
          </p>
          <app-link-box [url]="animationUrl()" />
          <p class="help">{{ createdMessages.laterHelp }}</p>
        </section>
        <div class="actions">
          <button type="button" class="btn btn-primary" (click)="goToSession(created.sessionId)">
            {{ createdMessages.goToSession }}
          </button>
        </div>
      </main>
    } @else {
      <main class="page narrow">
        <h1>{{ messages.title }}</h1>
        <p class="lead">{{ messages.lead }}</p>
        <p class="notice" role="note">{{ messages.notice }}</p>
        <form class="card" (submit)="submit($event)" novalidate>
          <h2>{{ messages.createTitle }}</h2>
          <div class="field">
            <label for="create-name">{{ messages.nameLabel }}</label>
            <input
              id="create-name"
              class="input"
              maxlength="120"
              [value]="name()"
              (input)="name.set($any($event.target).value)"
            />
          </div>
          <div class="field">
            <label for="create-pseudo">{{ messages.pseudoLabel }}</label>
            <input
              id="create-pseudo"
              class="input"
              maxlength="40"
              autocomplete="nickname"
              [value]="pseudo()"
              (input)="pseudo.set($any($event.target).value)"
            />
            <span class="help">{{ messages.pseudoHelp }}</span>
          </div>
          <div class="field">
            <label for="create-method">{{ messages.methodLabel }}</label>
            @if (methods().length > 0) {
              <select
                id="create-method"
                class="input"
                aria-describedby="create-method-help"
                (change)="methodKey.set($any($event.target).value)"
              >
                @for (method of methods(); track method.key) {
                  <option [value]="method.key" [selected]="method.key === selectedMethod()?.key">
                    {{ method.name }} (version {{ method.version }}) : {{ method.formula }}
                  </option>
                }
              </select>
            } @else if (methodsFailed()) {
              <span class="err" role="alert">{{ messages.methodsError }}</span>
              <button type="button" class="btn btn-secondary btn-sm" (click)="loadMethods()">
                {{ messages.methodsRetry }}
              </button>
            } @else {
              <span class="muted" role="status">{{ messages.methodsLoading }}</span>
            }
            <span class="help" id="create-method-help">
              {{ messages.methodHelp }}
              @if (selectedMethod()) {
                <button type="button" class="link-button" (click)="showMethod.set(true)">
                  {{ messages.methodDetail }}
                </button>
              }
            </span>
          </div>
          @if (error(); as text) {
            <p class="err" role="alert">{{ text }}</p>
          }
          <button type="submit" class="btn btn-primary" [disabled]="busy() || !selectedMethod()">
            {{ busy() ? messages.submitting : messages.submit }}
          </button>
        </form>
      </main>
      @if (showMethod() && selectedMethod(); as method) {
        <app-method-panel [definition]="method" (closed)="showMethod.set(false)" />
      }
    }
  `,
})
export class HomeComponent implements OnInit {
  private readonly api = inject(SessionApi);
  private readonly storage = inject(BrowserStorage);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  protected readonly messages = MESSAGES.home;
  protected readonly createdMessages = MESSAGES.created;

  protected readonly name = signal('');
  protected readonly pseudo = signal(this.storage.readPseudo() ?? '');
  protected readonly methods = signal<readonly MethodDefinition[]>([]);
  protected readonly methodKey = signal<string | null>(null);
  protected readonly methodsFailed = signal(false);
  protected readonly showMethod = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly created = signal<CreateSessionResponse | null>(null);

  /** WSJF est choisie par défaut : la première méthode proposée tant que rien n'est choisi. */
  protected readonly selectedMethod = computed<MethodDefinition | null>(() => {
    const methods = this.methods();
    return methods.find((method) => method.key === this.methodKey()) ?? methods[0] ?? null;
  });

  protected readonly inviteUrl = computed(
    () => `${this.document.location.origin}/s/${this.created()?.sessionId ?? ''}`,
  );
  protected readonly animationUrl = computed(
    () => `${this.inviteUrl()}/animer#${this.created()?.animationToken ?? ''}`,
  );

  ngOnInit(): void {
    this.loadMethods();
  }

  protected loadMethods(): void {
    this.methodsFailed.set(false);
    this.api.listMethods().then(
      (methods) => this.methods.set(methods),
      () => this.methodsFailed.set(true),
    );
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    const name = this.name().trim();
    const pseudo = this.pseudo().trim();
    if (name === '' || [...name].length > 120) {
      this.error.set(this.messages.nameRequired);
      return;
    }
    if (pseudo === '' || [...pseudo].length > 40) {
      this.error.set(this.messages.pseudoRequired);
      return;
    }
    const method = this.selectedMethod();
    if (!method) return;
    this.error.set(null);
    this.busy.set(true);
    try {
      const response = await this.api.createSession({ name, pseudo, method: method.key });
      this.storage.saveToken(response.sessionId, response.participantToken);
      this.storage.saveAnimationToken(response.sessionId, response.animationToken);
      this.storage.savePseudo(pseudo);
      this.created.set(response);
    } catch (e) {
      const kind = e instanceof SessionApiError ? e.kind : 'network';
      this.error.set((e instanceof SessionApiError ? e.detail : null) ?? MESSAGES.apiErrors[kind]);
    } finally {
      this.busy.set(false);
    }
  }

  protected goToSession(sessionId: string): void {
    void this.router.navigate(['/s', sessionId]);
  }
}
