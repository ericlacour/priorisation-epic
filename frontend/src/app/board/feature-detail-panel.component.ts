import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { Feature, SessionState } from '../api/contract';
import { MESSAGES } from '../i18n/messages.fr';
import { SessionStateService } from '../session/session-state.service';
import { DrawerComponent } from '../shared/drawer.component';
import { criterionValue, isMasked } from './feature-cells';

/**
 * Panneau de détail d'une fonctionnalité (FR-016, FR-016b, écran 4 ter) : identifiant, rang, titre, descriptif
 * complet, valeurs retenues avec le nom complet des critères, détail du calcul (`score.explanation`, affiché tel
 * quel) et contribution de chaque critère. Pendant un tour ouvert, un participant lit le descriptif mais ni les
 * valeurs ni le calcul (FR-019a). Il se ferme par la croix, Échap ou un clic à côté.
 *
 * Pour l'animateur (`canEdit`) : marque « à revoir » (FR-006a) et mode édition du titre et du descriptif.
 * « Enregistrer » envoie **une seule** intention `updateFeature` avec la `version` lue ; « Annuler » n'envoie rien.
 * Sur `STALE_VERSION`, la version actuelle est montrée avant de la garder ou de la remplacer.
 */
@Component({
  selector: 'app-feature-detail-panel',
  imports: [DrawerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-drawer labelledBy="feature-detail-title" (closed)="closed.emit()">
      <div drawer-head>
        <span class="muted small">{{ messages.rankLine(feature().externalId, rank()) }}</span>
        @if (editing()) {
          <div class="field">
            <label for="feature-detail-title">{{ messages.titleLabel }}</label>
            <input
              id="feature-detail-title"
              class="input"
              type="text"
              maxlength="200"
              [attr.aria-invalid]="titleInvalid() ? 'true' : null"
              [value]="draftTitle()"
              (input)="draftTitle.set(valueOf($event))"
            />
          </div>
        } @else {
          <h2 id="feature-detail-title">{{ feature().title }}</h2>
        }
      </div>

      @if (editing()) {
        <div class="field">
          <label for="feature-detail-description">{{ messages.descriptionLabel }}</label>
          <textarea
            id="feature-detail-description"
            class="input"
            rows="8"
            maxlength="5000"
            [value]="draftDescription()"
            (input)="draftDescription.set(valueOf($event))"
          ></textarea>
          <span class="help">{{ messages.descriptionHelp }}</span>
        </div>
      } @else {
        <h3>{{ messages.description }}</h3>
        @if (feature().description) {
          <p class="description">{{ feature().description }}</p>
        } @else {
          <p class="muted">{{ messages.noDescription }}</p>
        }
      }

      @if (feedback(); as feedback) {
        <p
          class="notice"
          [class.success]="feedback.kind === 'saved'"
          [class.danger]="feedback.kind === 'error'"
          [attr.role]="feedback.kind === 'saved' ? 'status' : 'alert'"
        >
          {{ feedback.text }}
        </p>
      }

      @if (stale(); as current) {
        <div class="notice danger" role="alert">
          <div>
            <p>{{ messages.staleIntro }}</p>
            <p>
              <b>{{ messages.staleTitle }}</b> : {{ current.title }}<br />
              <b>{{ messages.staleDescription }}</b> : {{ current.description ?? '' }}
            </p>
            <p class="actions">
              <button type="button" class="btn btn-secondary btn-sm" (click)="keepCurrent()">
                {{ messages.keepCurrent }}
              </button>
              <button type="button" class="btn btn-primary btn-sm" (click)="overwrite(current)">
                {{ messages.overwrite }}
              </button>
            </p>
          </div>
        </div>
      }

      @if (canEdit() && !editing()) {
        <div class="review-box">
          <div class="actions between">
            <span class="small strong">{{ messages.reviewMark }}</span>
            <span class="badge" [class.review]="feature().markedForReview">
              {{
                feature().markedForReview
                  ? feature().reviewReason || messages.reviewMark
                  : messages.reviewNone
              }}
            </span>
          </div>
          @if (feature().markedForReview) {
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              [disabled]="busy()"
              (click)="unmark()"
            >
              {{ messages.unmarkReview }}
            </button>
          } @else {
            <input
              class="input"
              type="text"
              maxlength="200"
              [attr.aria-label]="messages.reviewReasonLabel"
              [placeholder]="messages.reviewReasonPlaceholder"
              [value]="reviewReason()"
              (input)="reviewReason.set(valueOf($event))"
            />
            <div class="actions">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                [disabled]="busy()"
                (click)="mark()"
              >
                {{ messages.markReview }}
              </button>
              <span class="help">{{ messages.reviewHelp }}</span>
            </div>
          }
        </div>
      }

      <h3>{{ messages.values }}</h3>
      @if (masked()) {
        <p class="notice info">{{ messages.valuesMasked }}</p>
      } @else {
        <div class="crit-grid">
          @for (criterion of definition().criteria; track criterion.key) {
            <div>
              <span class="muted small">{{ criterion.code }} · {{ criterion.label }}</span>
              <b>{{ value(criterion.key) ?? messages.notEntered }}</b>
            </div>
          }
        </div>
        <h3>{{ messages.calculation }}</h3>
        @if (feature().score?.explanation; as explanation) {
          <p class="formula">{{ explanation }}</p>
        } @else {
          <p class="muted">{{ messages.notComputed }}</p>
        }
        <h3>{{ messages.contribution }}</h3>
        <div class="contrib">
          @for (criterion of definition().criteria; track criterion.key) {
            <span>{{ criterion.code }}</span>
            <span class="bar-track">
              <span class="bar" [style.width.%]="barWidth(criterion.key)"></span>
            </span>
            <span>{{ value(criterion.key) ?? messages.notEntered }}</span>
          }
        </div>
        <p class="help">
          <button type="button" class="link-button" (click)="methodRequested.emit()">
            {{ messages.methodLink(definition().name, state().methodVersion) }}
          </button>
        </p>
      }

      @if (canEdit()) {
        <div drawer-foot>
          @if (editing()) {
            <div class="actions end">
              <button
                type="button"
                class="btn btn-secondary"
                [disabled]="busy()"
                (click)="cancelEdit()"
              >
                {{ messages.cancel }}
              </button>
              <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="save()">
                {{ busy() ? messages.saving : messages.save }}
              </button>
            </div>
          } @else {
            <button type="button" class="btn btn-secondary" (click)="startEdit()">
              {{ messages.edit }}
            </button>
          }
        </div>
      }
    </app-drawer>
  `,
})
export class FeatureDetailPanelComponent {
  private readonly session = inject(SessionStateService);
  protected readonly messages = MESSAGES.detail;

  readonly feature = input.required<Feature>();
  readonly state = input.required<SessionState>();
  /** Vrai pour l'animateur sur ordinateur : marque « à revoir » et mode édition. */
  readonly canEdit = input(false);
  readonly closed = output<void>();
  /** L'utilisateur demande le panneau « Méthode de la session ». */
  readonly methodRequested = output<void>();

  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected readonly draftTitle = signal('');
  protected readonly draftDescription = signal('');
  protected readonly reviewReason = signal('');
  protected readonly titleInvalid = signal(false);
  protected readonly stale = signal<Feature | null>(null);
  protected readonly feedback = signal<{ kind: 'saved' | 'error'; text: string } | null>(null);

  protected readonly definition = computed(() => this.state().methodDefinition);
  protected readonly masked = computed(() => isMasked(this.feature()));
  protected readonly rank = computed(() => this.feature().score?.rank ?? null);
  /** Version lue à l'ouverture du mode édition. */
  private editedVersion = 0;

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected value(key: string): number | null {
    return criterionValue(this.feature(), key);
  }

  /** Part de la plus grande valeur saisie : contribution relative de chaque critère. */
  protected barWidth(key: string): number {
    const feature = this.feature();
    const values = this.definition().criteria.map((c) => criterionValue(feature, c.key) ?? 0);
    const max = Math.max(...values, 0);
    return max === 0 ? 0 : ((this.value(key) ?? 0) / max) * 100;
  }

  protected startEdit(): void {
    const feature = this.feature();
    this.editedVersion = feature.version;
    this.draftTitle.set(feature.title);
    this.draftDescription.set(feature.description ?? '');
    this.titleInvalid.set(false);
    this.stale.set(null);
    this.feedback.set(null);
    this.editing.set(true);
  }

  /** « Annuler » restaure le contenu et n'envoie rien. */
  protected cancelEdit(): void {
    this.editing.set(false);
    this.stale.set(null);
    this.feedback.set(null);
  }

  protected keepCurrent(): void {
    this.cancelEdit();
  }

  protected async save(): Promise<void> {
    const title = this.draftTitle().trim();
    this.titleInvalid.set(title === '');
    if (title === '') {
      this.feedback.set({ kind: 'error', text: this.messages.titleRequired });
      return;
    }
    const feature = this.feature();
    const description = this.draftDescription().trim() === '' ? null : this.draftDescription();
    const changes = {
      ...(title !== feature.title ? { title } : {}),
      ...(description !== feature.description ? { description } : {}),
    };
    if (Object.keys(changes).length === 0) {
      this.cancelEdit();
      return;
    }
    await this.send(this.editedVersion, changes, true);
  }

  protected async overwrite(current: Feature): Promise<void> {
    const title = this.draftTitle().trim();
    const description = this.draftDescription().trim() === '' ? null : this.draftDescription();
    const changes = {
      ...(title !== current.title ? { title } : {}),
      ...(description !== current.description ? { description } : {}),
    };
    this.stale.set(null);
    if (Object.keys(changes).length === 0) {
      this.cancelEdit();
      return;
    }
    await this.send(current.version, changes, true);
  }

  protected async mark(): Promise<void> {
    const reason = this.reviewReason().trim();
    await this.send(
      this.feature().version,
      { markedForReview: true, ...(reason ? { reviewReason: reason } : {}) },
      false,
    );
    this.reviewReason.set('');
  }

  protected async unmark(): Promise<void> {
    await this.send(this.feature().version, { markedForReview: false }, false);
  }

  private async send(
    version: number,
    changes: Parameters<SessionStateService['updateFeature']>[2],
    leavesEditing: boolean,
  ): Promise<void> {
    this.busy.set(true);
    this.feedback.set(null);
    const result = await this.session.updateFeature(this.feature().id, version, changes);
    this.busy.set(false);
    if (result.ok) {
      if (leavesEditing) {
        this.editing.set(false);
        this.feedback.set({ kind: 'saved', text: this.messages.saved });
      }
    } else if (result.code === 'STALE_VERSION') {
      this.stale.set(this.session.feature(this.feature().id) ?? this.feature());
    } else {
      this.feedback.set({ kind: 'error', text: MESSAGES.errors[result.code] });
    }
  }
}
