import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';

import { ImportPreview, ImportResult } from '../api/contract';
import { SessionApi, SessionApiError } from '../api/session-api';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';
import { SessionRoomService } from '../session/session-room.service';
import { ModalComponent } from '../shared/modal.component';
import { allowedValuesOf, scaleLabel } from '../shared/scale';

type Phase = 'choose' | 'reading' | 'preview' | 'importing' | 'done';
type Tab = 'valid' | 'rejected' | 'warnings';

/**
 * Import de fonctionnalités par fichier (FR-007, FR-007a, FR-008) : l'animateur choisit un fichier Excel, CSV ou
 * JSON ; l'aperçu montre les lignes valides, les lignes rejetées avec leur motif et les avertissements, sans rien
 * écrire. Il confirme (une seule transaction côté serveur, puis le tableau se met à jour chez tous) ou annule, et
 * voit le récapitulatif. Les en-têtes attendus et le modèle viennent de la méthode de la session (FR-017b).
 * « Importer depuis Jira » est montré, désactivé : une illustration de l'import à venir (FR-007b).
 */
@Component({
  selector: 'app-import-dialog',
  imports: [ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal labelledBy="import-title" (closed)="closed.emit()">
      <h2 id="import-title">{{ messages.title }}</h2>

      @if (phase() === 'done') {
        <p class="notice success" role="status">{{ doneText() }}</p>
        <div class="actions end">
          <button type="button" class="btn btn-primary" (click)="closed.emit()">
            {{ messages.close }}
          </button>
        </div>
      } @else {
        @if (phase() === 'choose' || phase() === 'reading') {
          <div class="dropzone small">
            <label for="import-file"
              ><b>{{ messages.file }}</b></label
            >
            <input
              id="import-file"
              type="file"
              accept=".xlsx,.csv,.json"
              [disabled]="phase() === 'reading'"
              (change)="read($event)"
            />
            <span class="muted">{{ messages.formats }}</span>
          </div>
          <!-- Une illustration : l'import depuis Jira n'est pas encore branché. -->
          <div class="import-jira">
            <span class="muted small">{{ messages.jira.or }}</span>
            <button
              type="button"
              class="btn btn-secondary"
              disabled
              aria-describedby="import-jira-hint"
            >
              {{ messages.jira.button }}
              <span class="badge">{{ messages.jira.soon }}</span>
            </button>
            <p id="import-jira-hint" class="muted small">{{ messages.jira.hint }}</p>
          </div>
        } @else if (preview(); as preview) {
          <div class="dropzone small">
            <span>{{ fileSummary() }}</span>
            <button
              type="button"
              class="link-button"
              [disabled]="phase() === 'importing'"
              (click)="reset()"
            >
              {{ messages.anotherFile }}
            </button>
          </div>
        }
        <p class="small">
          {{ messages.expectedHeaders }}
          @for (header of headers(); track header; let last = $last) {
            <code>{{ header }}</code
            >{{ last ? '.' : ', ' }}
          }
          <a [href]="templateUrl()" download>{{ messages.template }}</a>
        </p>

        @if (phase() === 'reading') {
          <p class="muted" role="status">{{ messages.reading }}</p>
        }
        @if (error(); as error) {
          <p class="notice danger" role="alert">{{ error }}</p>
        }

        @if (preview(); as preview) {
          <div class="stats">
            <div class="stat ok">
              <b>{{ preview.validRows.length }}</b
              ><span class="small">{{ messages.stats.valid }}</span>
            </div>
            <div class="stat ko">
              <b>{{ preview.rejectedRows.length }}</b
              ><span class="small">{{ messages.stats.rejected }}</span>
            </div>
            <div class="stat wn">
              <b>{{ preview.warnings.length }}</b
              ><span class="small">{{ messages.stats.warnings }}</span>
            </div>
          </div>
          @if (scaleNotice(); as notice) {
            <p class="notice info" role="note">{{ notice }}</p>
          }
          <div>
            <div class="tabs" role="tablist" [attr.aria-label]="messages.title">
              @for (tab of tabs; track tab) {
                <button
                  type="button"
                  role="tab"
                  [id]="'import-tab-' + tab"
                  [attr.aria-selected]="selectedTab() === tab"
                  aria-controls="import-tab-panel"
                  (click)="selectedTab.set(tab)"
                >
                  {{ tabLabel(tab, preview) }}
                </button>
              }
            </div>
            <div
              id="import-tab-panel"
              class="table-wrap preview-table"
              role="tabpanel"
              tabindex="0"
              [attr.aria-labelledby]="'import-tab-' + selectedTab()"
            >
              <table class="mini-table">
                @switch (selectedTab()) {
                  @case ('valid') {
                    <thead>
                      <tr>
                        <th>{{ messages.columns.line }}</th>
                        <th>{{ messages.columns.externalId }}</th>
                        <th>{{ messages.columns.title }}</th>
                        @for (criterion of criteria(); track criterion.key) {
                          <th class="num">{{ criterion.code }}</th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of preview.validRows; track row.line) {
                        <tr>
                          <td>{{ row.line }}</td>
                          <td>{{ row.externalId }}</td>
                          <td class="wrap">{{ row.title }}</td>
                          @for (criterion of criteria(); track criterion.key) {
                            <td class="num">{{ row.criteria[criterion.key] ?? noValue }}</td>
                          }
                        </tr>
                      } @empty {
                        <tr>
                          <td [attr.colspan]="3 + criteria().length" class="muted">
                            {{ messages.none }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  }
                  @case ('rejected') {
                    <thead>
                      <tr>
                        <th>{{ messages.columns.line }}</th>
                        <th>{{ messages.columns.externalId }}</th>
                        <th>{{ messages.columns.reason }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of preview.rejectedRows; track $index) {
                        <tr>
                          <td>{{ row.line }}</td>
                          <td>{{ row.externalId ?? noValue }}</td>
                          <td class="wrap">{{ row.reason }}</td>
                        </tr>
                      } @empty {
                        <tr>
                          <td colspan="3" class="muted">{{ messages.none }}</td>
                        </tr>
                      }
                    </tbody>
                  }
                  @case ('warnings') {
                    <thead>
                      <tr>
                        <th>{{ messages.columns.line }}</th>
                        <th>{{ messages.columns.message }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (warning of preview.warnings; track $index) {
                        <tr>
                          <td>{{ warning.line === 0 ? messages.wholeFile : warning.line }}</td>
                          <td class="wrap">{{ warning.message }}</td>
                        </tr>
                      } @empty {
                        <tr>
                          <td colspan="2" class="muted">{{ messages.none }}</td>
                        </tr>
                      }
                    </tbody>
                  }
                }
              </table>
            </div>
          </div>
          @if (preview.validRows.length === 0) {
            <p class="help">{{ messages.nothingToImport }}</p>
          }
        }

        <div class="actions end">
          <button type="button" class="btn btn-secondary" (click)="closed.emit()">
            {{ messages.cancel }}
          </button>
          @if (preview(); as preview) {
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="phase() === 'importing' || preview.validRows.length === 0"
              (click)="confirm()"
            >
              {{ phase() === 'importing' ? messages.importing : confirmLabel() }}
            </button>
          }
        </div>
      }
    </app-modal>
  `,
})
export class ImportDialogComponent {
  readonly closed = output<void>();

  private readonly room = inject(SessionRoomService);
  private readonly api = inject(SessionApi);

  protected readonly messages = MESSAGES.importDialog;
  protected readonly noValue = MESSAGES.board.noValue;
  protected readonly tabs: readonly Tab[] = ['valid', 'rejected', 'warnings'];

  protected readonly phase = signal<Phase>('choose');
  protected readonly error = signal<string | null>(null);
  protected readonly preview = signal<ImportPreview | null>(null);
  protected readonly result = signal<ImportResult | null>(null);
  protected readonly selectedTab = signal<Tab>('valid');
  private readonly fileName = signal('');

  private readonly state = this.room.state;
  protected readonly criteria = computed(() => this.state()?.methodDefinition.criteria ?? []);

  /** `Identifiant`, `Titre`, `Description`, puis l'en-tête de chaque critère de la méthode. */
  protected readonly headers = computed(() => [
    ...this.messages.fileHeaders,
    ...this.criteria().map((criterion) => criterion.header),
  ]);

  protected readonly templateUrl = computed(() => {
    const state = this.state();
    return state ? this.api.templateUrl(state.method, state.methodVersion) : '';
  });

  protected readonly fileSummary = computed(() => {
    const preview = this.preview();
    const count = preview ? preview.validRows.length + preview.rejectedRows.length : 0;
    return format(this.messages.fileSummary, { name: this.fileName(), count });
  });

  protected readonly confirmLabel = computed(() => {
    const count = this.preview()?.validRows.length ?? 0;
    return count === 1 ? this.messages.confirmOne : format(this.messages.confirm, { count });
  });

  protected readonly scaleNotice = computed(() => {
    const scale = this.preview()?.scale;
    if (!scale) return null;
    const label = scaleLabel({ ...scale, allowedValues: allowedValuesOf(scale.type, scale.max) });
    return format(this.messages.scaleApplied, { scale: label });
  });

  protected readonly doneText = computed(() => {
    const result = this.result();
    return result
      ? format(this.messages.done, { imported: result.imported, rejected: result.rejected })
      : '';
  });

  protected tabLabel(tab: Tab, preview: ImportPreview): string {
    const count =
      tab === 'valid'
        ? preview.validRows.length
        : tab === 'rejected'
          ? preview.rejectedRows.length
          : preview.warnings.length;
    return format(this.messages.tabs[tab], { count });
  }

  /** Le fichier choisi est lu par le serveur : l'aperçu revient sans que rien ne soit écrit. */
  protected async read(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const state = this.state();
    if (!file || !state) return;
    const tokens = this.room.facilitatorTokens();
    this.error.set(null);
    if (!tokens) {
      this.error.set(this.messages.errors.forbidden);
      return;
    }
    this.phase.set('reading');
    this.fileName.set(file.name);
    try {
      const preview = await this.api.previewImport(state.sessionId, file, file.name, tokens);
      this.preview.set(preview);
      this.selectedTab.set(preview.rejectedRows.length > 0 ? 'rejected' : 'valid');
      this.phase.set('preview');
    } catch (e) {
      this.error.set(this.errorText(e));
      this.phase.set('choose');
      input.value = '';
    }
  }

  protected async confirm(): Promise<void> {
    const preview = this.preview();
    const state = this.state();
    const tokens = this.room.facilitatorTokens();
    if (!preview || !state) return;
    if (!tokens) {
      this.error.set(this.messages.errors.forbidden);
      return;
    }
    this.error.set(null);
    this.phase.set('importing');
    try {
      this.result.set(await this.api.confirmImport(state.sessionId, preview.previewId, tokens));
      this.phase.set('done');
    } catch (e) {
      if (e instanceof SessionApiError && e.kind === 'notFound') {
        this.reset();
        this.error.set(this.messages.errors.expired);
      } else {
        this.error.set(this.errorText(e));
        this.phase.set('preview');
      }
    }
  }

  /** Revient au choix du fichier ; l'aperçu abandonné expire seul côté serveur. */
  protected reset(): void {
    this.preview.set(null);
    this.error.set(null);
    this.phase.set('choose');
  }

  private errorText(e: unknown): string {
    if (!(e instanceof SessionApiError)) return this.messages.errors.network;
    switch (e.kind) {
      case 'invalid':
        return e.detail ?? MESSAGES.apiErrors.invalid;
      case 'tooLarge':
        return this.messages.errors.tooLarge;
      case 'forbidden':
        return this.messages.errors.forbidden;
      case 'notFound':
        return MESSAGES.apiErrors.notFound;
      default:
        return this.messages.errors.network;
    }
  }
}
