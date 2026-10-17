import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { SessionSummary } from '../api/contract';
import { SessionApi } from '../api/session-api';
import { SessionStatus } from '../api/session-state';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';
import { statusBadge } from '../shared/status-badge';
import {
  ALL_STATUSES,
  facilitators,
  filterSessions,
  findFacilitator,
  matchName,
} from './session-filter';

const DATE = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/**
 * Liste des sessions de l'accueil (FR-026, US5) : nom, animateur, date (JJ/MM/AAAA), méthode et statut, de la plus
 * récente à la plus ancienne, dans l'ordre reçu du serveur. Le nom ouvre la session ; une session clôturée s'ouvre
 * en lecture seule. Trois filtres combinés, appliqués dans le navigateur (FR-026b) : le nom (contient, sans
 * majuscules ni accents, passage surligné), l'animateur (seulement un animateur existant) et le statut.
 */
@Component({
  selector: 'app-session-list',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card session-list" aria-labelledby="session-list-title">
      <div class="session-list-head">
        <h2 id="session-list-title">{{ messages.title }}</h2>
        @if (sessions()?.length) {
          <span class="muted small" role="status">{{ count() }}</span>
        }
      </div>
      <p class="muted small">{{ messages.lead }}</p>
      @if (sessions(); as sessions) {
        @if (sessions.length === 0) {
          <p class="muted">{{ messages.empty }}</p>
        } @else {
          <div class="session-filters" role="search" [attr.aria-label]="filters.label">
            <div class="field">
              <label for="filter-name">{{ filters.name }}</label>
              <input
                id="filter-name"
                class="input"
                type="search"
                autocomplete="off"
                [placeholder]="filters.namePlaceholder"
                [value]="name()"
                (input)="name.set($any($event.target).value)"
              />
            </div>
            <div class="field">
              <label for="filter-facilitator">{{ filters.facilitator }}</label>
              <input
                id="filter-facilitator"
                class="input"
                list="filter-facilitator-list"
                autocomplete="off"
                [placeholder]="filters.facilitatorPlaceholder"
                [class.error]="facilitatorError()"
                [attr.aria-invalid]="facilitatorError() ? 'true' : null"
                [attr.aria-describedby]="facilitatorError() ? 'filter-facilitator-error' : null"
                [value]="facilitatorInput()"
                (input)="typeFacilitator($any($event.target).value)"
                (change)="facilitatorTouched.set(true)"
              />
              <datalist id="filter-facilitator-list">
                @for (pseudo of knownFacilitators(); track pseudo) {
                  <option [value]="pseudo"></option>
                }
              </datalist>
            </div>
            <fieldset class="status-filter">
              <legend>{{ filters.status }}</legend>
              @for (status of allStatuses; track status) {
                <label>
                  <input
                    type="checkbox"
                    [checked]="statuses().has(status)"
                    (change)="toggleStatus(status, $any($event.target).checked)"
                  />
                  {{ statusLabels[status] }}
                </label>
              }
            </fieldset>
          </div>
          @if (facilitatorError()) {
            <p class="err small" id="filter-facilitator-error" role="alert">
              {{ facilitatorErrorText() }}
            </p>
          }
          @if (filtered().length === 0) {
            <div class="session-list-empty">
              <p class="muted">{{ filters.noMatch }}</p>
              <button type="button" class="btn btn-secondary btn-sm" (click)="clearFilters()">
                {{ filters.clear }}
              </button>
            </div>
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
                  @for (row of rows(); track row.session.sessionId) {
                    @let session = row.session;
                    <tr>
                      <td class="title" [attr.title]="session.name">
                        <!-- prettier-ignore -->
                        <a [routerLink]="['/s', session.sessionId]" [attr.aria-label]="openLabel(session)">{{ row.name.before }}@if (row.name.match) {<mark>{{ row.name.match }}</mark>}{{ row.name.after }}</a>
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
  protected readonly filters = MESSAGES.sessionList.filters;
  protected readonly statusLabels = MESSAGES.board.status;
  protected readonly allStatuses = ALL_STATUSES;

  protected readonly sessions = signal<readonly SessionSummary[] | null>(null);
  protected readonly failed = signal(false);

  protected readonly name = signal('');
  protected readonly facilitatorInput = signal('');
  /** Vrai quand la saisie de l'animateur est validée (champ quitté ou suggestion choisie), pour n'afficher le refus qu'alors. */
  protected readonly facilitatorTouched = signal(false);
  protected readonly statuses = signal<ReadonlySet<SessionStatus>>(new Set(ALL_STATUSES));

  protected readonly knownFacilitators = computed(() => facilitators(this.sessions() ?? []));
  /** L'animateur existant qui correspond à la saisie : le filtre ne s'applique qu'à lui. */
  private readonly facilitator = computed(() =>
    findFacilitator(this.knownFacilitators(), this.facilitatorInput()),
  );
  protected readonly facilitatorError = computed(
    () =>
      this.facilitatorTouched() &&
      this.facilitatorInput().trim() !== '' &&
      this.facilitator() === null,
  );
  protected readonly facilitatorErrorText = computed(() =>
    format(this.filters.facilitatorUnknown, { pseudo: this.facilitatorInput().trim() }),
  );

  protected readonly filtered = computed(() =>
    filterSessions(this.sessions() ?? [], {
      name: this.name(),
      facilitator: this.facilitator(),
      statuses: this.statuses(),
    }),
  );
  /** Les sessions affichées, avec leur nom découpé autour du passage trouvé. */
  protected readonly rows = computed(() =>
    this.filtered().map((session) => ({
      session,
      name: matchName(session.name, this.name()) ?? { before: session.name, match: '', after: '' },
    })),
  );
  protected readonly count = computed(() => {
    const shown = this.filtered().length;
    const template = shown <= 1 ? this.filters.countOne : this.filters.count;
    return format(template, { shown, total: this.sessions()?.length ?? 0 });
  });

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

  protected typeFacilitator(value: string): void {
    this.facilitatorInput.set(value);
    this.facilitatorTouched.set(false);
  }

  protected toggleStatus(status: SessionStatus, checked: boolean): void {
    const next = new Set(this.statuses());
    if (checked) next.add(status);
    else next.delete(status);
    this.statuses.set(next);
  }

  protected clearFilters(): void {
    this.name.set('');
    this.facilitatorInput.set('');
    this.facilitatorTouched.set(false);
    this.statuses.set(new Set(ALL_STATUSES));
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
