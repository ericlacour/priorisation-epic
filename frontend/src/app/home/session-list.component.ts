import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SessionSummary } from '../api/contract';
import { SessionApi } from '../api/session-api';
import { SessionStatus } from '../api/session-state';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';
import { statusBadge } from '../shared/status-badge';

const DATE = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/**
 * Liste des sessions de l'accueil (FR-026, US5) : nom, animateur, date (JJ/MM/AAAA), méthode et statut, de la plus
 * récente à la plus ancienne, dans l'ordre reçu du serveur. Le nom ouvre la session ; une session clôturée s'ouvre
 * en lecture seule.
 */
@Component({
  selector: 'app-session-list',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card session-list" aria-labelledby="session-list-title">
      <h2 id="session-list-title">{{ messages.title }}</h2>
      <p class="muted small">{{ messages.lead }}</p>
      @if (sessions(); as sessions) {
        @if (sessions.length === 0) {
          <p class="muted">{{ messages.empty }}</p>
        } @else {
          <div class="session-list-wrap">
            <table [attr.aria-label]="messages.tableLabel">
              <thead>
                <tr>
                  <th scope="col">{{ messages.columns.name }}</th>
                  <th scope="col">{{ messages.columns.facilitator }}</th>
                  <th scope="col">{{ messages.columns.date }}</th>
                  <th scope="col">{{ messages.columns.method }}</th>
                  <th scope="col">{{ messages.columns.status }}</th>
                </tr>
              </thead>
              <tbody>
                @for (session of sessions; track session.sessionId) {
                  <tr>
                    <td class="title" [attr.title]="session.name">
                      <a
                        [routerLink]="['/s', session.sessionId]"
                        [attr.aria-label]="openLabel(session)"
                        >{{ session.name }}</a
                      >
                    </td>
                    <td>{{ session.facilitatorPseudo }}</td>
                    <td>{{ date(session) }}</td>
                    <td>{{ method(session) }}</td>
                    <td>
                      <span [class]="statusBadge(session.status)">{{
                        statusLabels[session.status]
                      }}</span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      } @else if (failed()) {
        <p class="err" role="alert">{{ messages.error }}</p>
        <button type="button" class="btn btn-secondary btn-sm" (click)="load()">
          {{ messages.retry }}
        </button>
      } @else {
        <p class="muted" role="status">{{ messages.loading }}</p>
      }
    </section>
  `,
})
export class SessionListComponent implements OnInit {
  private readonly api = inject(SessionApi);
  protected readonly messages = MESSAGES.sessionList;
  protected readonly statusLabels = MESSAGES.board.status;

  protected readonly sessions = signal<readonly SessionSummary[] | null>(null);
  protected readonly failed = signal(false);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.failed.set(false);
    this.api.listSessions().then(
      (sessions) => this.sessions.set(sessions),
      () => this.failed.set(true),
    );
  }

  protected date(session: SessionSummary): string {
    return DATE.format(new Date(session.createdAt));
  }

  protected method(session: SessionSummary): string {
    return format(this.messages.method, { method: session.method, version: session.methodVersion });
  }

  protected openLabel(session: SessionSummary): string {
    return format(this.messages.open, { name: session.name });
  }

  protected statusBadge(status: SessionStatus): string {
    return statusBadge(status);
  }
}
