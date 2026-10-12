import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';

import { CreateSessionResponse, MethodDefinition } from '../api/contract';
import { SessionApi, SessionApiError } from '../api/session-api';
import { MESSAGES } from '../i18n/messages.fr';
import { LinkBoxComponent } from '../shared/link-box.component';
import { MethodPanelComponent } from '../shared/method-panel.component';
import { animationUrl } from '../session/animation-link.component';
import { BrowserStorage } from '../storage/browser-storage';

const MAX_NAME = 120;
const MAX_PSEUDO = 40;

/**
 * Accueil (écrans 1 et 2 des maquettes, FR-001, FR-002, FR-017d) : le formulaire de création (nom, pseudo, méthode
 * de priorisation lue sur `GET /api/methods`, WSJF préchoisie), puis, une fois la session créée, les deux liens :
 * l'invitation à partager et le lien d'animation privé « à garder pour vous ». Les deux jetons sont rangés dans ce
 * navigateur avant d'être affichés ; le jeton d'animation n'est jamais mis dans une URL envoyée au serveur.
 */
@Component({
  selector: 'app-home',
  imports: [LinkBoxComponent, MethodPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (created(); as session) {
      <main class="page narrow">
        <h1>{{ messages.title }}</h1>
        <p class="notice success" role="status">{{ messages.created.ready }}</p>
        <section class="card">
          <h2>{{ messages.created.invitationTitle }}</h2>
          <p class="muted small">{{ messages.created.invitationHelp }}</p>
          <app-link-box [url]="invitationUrl()" [label]="messages.created.invitationTitle" />
        </section>
        <section class="secret">
          <h2>{{ messages.created.animationTitle }}</h2>
          <p class="small">
            <b>{{ messages.created.animationWarning }}</b> {{ messages.created.animationHelp }}
          </p>
          <app-link-box [url]="animationLink()" [label]="messages.created.animationTitle" />
          <p class="help">{{ messages.created.animationLater }}</p>
        </section>
        <p class="actions">
          <button type="button" class="btn btn-primary" (click)="goToSession(session)">
            {{ messages.created.goToSession }}
          </button>
        </p>
      </main>
    } @else {
      <main class="page">
        <h1>{{ messages.title }}</h1>
        <p class="lead">{{ messages.lead }}</p>
        <p class="notice info" role="note">{{ messages.notice }}</p>
        <form class="card" (submit)="create($event)" novalidate>
          <h2>{{ messages.createTitle }}</h2>
          <div class="field">
            <label for="home-name">{{ messages.nameLabel }}</label>
            <input
              id="home-name"
              class="input"
              type="text"
              maxlength="120"
              [class.error]="!!nameError()"
              [attr.aria-invalid]="nameError() ? 'true' : null"
              [attr.aria-describedby]="nameError() ? 'home-name-error' : null"
              [value]="name()"
              (input)="name.set(valueOf($event))"
            />
            @if (nameError(); as text) {
              <span class="err" id="home-name-error" role="alert">{{ text }}</span>
            }
          </div>
          <div class="field">
            <label for="home-pseudo">{{ messages.pseudoLabel }}</label>
            <input
              id="home-pseudo"
              class="input"
              type="text"
              maxlength="40"
              autocomplete="nickname"
              [class.error]="!!pseudoError()"
              [attr.aria-invalid]="pseudoError() ? 'true' : null"
              [attr.aria-describedby]="pseudoError() ? 'home-pseudo-error' : 'home-pseudo-help'"
              [value]="pseudo()"
              (input)="pseudo.set(valueOf($event))"
            />
            <span class="help" id="home-pseudo-help">{{ messages.pseudoHelp }}</span>
            @if (pseudoError(); as text) {
              <span class="err" id="home-pseudo-error" role="alert">{{ text }}</span>
            }
          </div>
          <div class="field">
            <label for="home-method">{{ messages.methodLabel }}</label>
            @if (methods().length > 0) {
              <select
                id="home-method"
                class="input"
                aria-describedby="home-method-help"
                [value]="methodKey()"
                (change)="methodKey.set(valueOf($event))"
              >
                @for (method of methods(); track method.key) {
                  <option [value]="method.key" [selected]="method.key === methodKey()">
                    {{ messages.methodOption(method.name, method.version, method.formula) }}
                  </option>
                }
              </select>
              <span class="help" id="home-method-help">
                {{ messages.methodHelp }}
                <button type="button" class="link-button" (click)="methodOpen.set(true)">
                  {{ messages.methodDetail }}
                </button>
              </span>
            } @else {
              <p class="help" id="home-method-help" role="status">
                {{ methodsFailed() ? messages.methodsError : messages.methodLoading }}
              </p>
            }
          </div>
          @if (formError(); as text) {
            <p class="notice danger" role="alert">{{ text }}</p>
          }
          <button type="submit" class="btn btn-primary" [disabled]="busy()">
            {{ busy() ? messages.creating : messages.submit }}
          </button>
        </form>
      </main>
      @if (methodOpen() && selectedMethod(); as method) {
        <app-method-panel [definition]="method" (closed)="methodOpen.set(false)" />
      }
    }
  `,
})
export class HomeComponent implements OnInit {
  private readonly api = inject(SessionApi);
  private readonly storage = inject(BrowserStorage);
  private readonly router = inject(Router);
  private readonly origin = inject(DOCUMENT).location.origin;
  protected readonly messages = MESSAGES.home;

  protected readonly name = signal('');
  protected readonly pseudo = signal(this.storage.readPseudo() ?? '');
  protected readonly methods = signal<readonly MethodDefinition[]>([]);
  protected readonly methodsFailed = signal(false);
  protected readonly methodKey = signal('');
  protected readonly methodOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly nameError = signal<string | null>(null);
  protected readonly pseudoError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly created = signal<CreateSessionResponse | null>(null);

  protected readonly selectedMethod = computed(
    () => this.methods().find((m) => m.key === this.methodKey()) ?? null,
  );
  protected readonly invitationUrl = computed(
    () => `${this.origin}/s/${encodeURIComponent(this.created()?.sessionId ?? '')}`,
  );
  protected readonly animationLink = computed(() => {
    const session = this.created();
    return session ? animationUrl(this.origin, session.sessionId, session.animationToken) : '';
  });

  ngOnInit(): void {
    this.api.listMethods().then(
      (methods) => {
        this.methods.set(methods);
        // La première est la méthode par défaut du serveur (contrat : GET /api/methods).
        this.methodKey.set(methods[0]?.key ?? '');
      },
      () => this.methodsFailed.set(true),
    );
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async create(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    const name = this.name().trim();
    const pseudo = this.pseudo().trim();
    this.nameError.set(name === '' || name.length > MAX_NAME ? this.messages.nameRequired : null);
    this.pseudoError.set(
      pseudo === '' || pseudo.length > MAX_PSEUDO ? this.messages.pseudoRequired : null,
    );
    this.formError.set(null);
    if (this.nameError() || this.pseudoError()) return;
    this.busy.set(true);
    try {
      const method = this.methodKey();
      const session = await this.api.createSession({
        name,
        pseudo,
        ...(method ? { method } : {}),
      });
      this.storage.saveToken(session.sessionId, session.participantToken);
      this.storage.saveAnimationToken(session.sessionId, session.animationToken);
      this.storage.savePseudo(pseudo);
      this.created.set(session);
    } catch (e) {
      this.formError.set(this.errorText(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected goToSession(session: CreateSessionResponse): void {
    void this.router.navigate(['/s', session.sessionId]);
  }

  private errorText(e: unknown): string {
    if (e instanceof SessionApiError) {
      if (e.kind === 'tooManyRequests') return this.messages.tooManyRequests;
      if (e.kind === 'invalid' && e.detail) return e.detail;
    }
    return this.messages.network;
  }
}
