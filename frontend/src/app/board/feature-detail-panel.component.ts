import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

import { Feature, MethodDefinition } from '../api/session-state';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';
import { SidePanelComponent } from '../shared/side-panel.component';

/** Texte modifié par l'animateur dans le panneau : un seul envoi pour les deux champs. */
export interface TextEdit {
  /** Version de la fonctionnalité quand l'édition a commencé : jamais d'écrasement silencieux (constitution III). */
  readonly baseVersion: number;
  readonly title: string;
  readonly description: string | null;
}

/** Marque « à revoir » demandée par l'animateur (FR-006a). */
export interface ReviewChange {
  readonly marked: boolean;
  readonly reason: string | null;
}

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;
const REASON_MAX = 200;

/**
 * Panneau de détail d'une fonctionnalité (FR-016, FR-016b), ouvert au clic sur son identifiant : descriptif complet,
 * valeurs retenues avec le nom complet des critères, détail du calcul tel que le serveur l'écrit (constitution I).
 * Les boutons de l'animateur, « Modifier le titre et le descriptif » et « Marquer à revoir », sont en haut du panneau,
 * sous le titre. Pendant la modification, « Enregistrer » (une seule modification émise) et « Annuler » (rien
 * d'émis) restent sous la saisie. Les valeurs et le calcul restent masqués tant que le serveur
 * ne les envoie pas (tour de vote ouvert, pour un participant).
 */
@Component({
  selector: 'app-feature-detail-panel',
  imports: [SidePanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-side-panel labelledBy="detail-title" (closed)="closed.emit()">
      <div class="panel-head">
        <span class="muted small">
          {{ feature().externalId }} · {{ rankLabel() }}
          @if (feature().markedForReview) {
            <span class="badge review" [attr.title]="feature().reviewReason">{{
              messages.marked
            }}</span>
          }
        </span>
        @if (editing()) {
          <div class="field">
            <label for="detail-title-input">{{ messages.titleLabel }}</label>
            <input
              id="detail-title-input"
              class="input wide"
              maxlength="200"
              [value]="draftTitle()"
              (input)="draftTitle.set($any($event.target).value)"
            />
          </div>
        } @else {
          <h2 id="detail-title">{{ feature().title }}</h2>
        }
      </div>

      @if (canAnimate() && !editing()) {
        <div class="actions">
          <button type="button" class="btn btn-secondary" (click)="startEdit()">
            {{ messages.editText }}
          </button>
          @if (feature().markedForReview) {
            <button
              type="button"
              class="btn btn-secondary"
              (click)="review.emit({ marked: false, reason: null })"
            >
              {{ messages.unmark }}
            </button>
          } @else if (marking()) {
            <div class="field">
              <label for="detail-reason">{{ messages.reasonLabel }}</label>
              <input
                id="detail-reason"
                class="input wide"
                maxlength="200"
                [value]="reason()"
                (input)="reason.set($any($event.target).value)"
              />
              <button type="button" class="btn btn-primary btn-sm" (click)="mark()">
                {{ messages.confirmMark }}
              </button>
            </div>
          } @else {
            <button type="button" class="btn btn-secondary" (click)="marking.set(true)">
              {{ messages.mark }}
            </button>
          }
        </div>
      }

      @if (savedMessage()) {
        <p class="notice success" role="status">{{ messages.saved }}</p>
      }
      @if (stale()) {
        <div class="notice danger" role="alert">
          <strong>{{ messages.staleTitle }}</strong>
          <span>{{ staleLead() }}</span>
          <button type="button" class="btn btn-secondary btn-sm" (click)="keepCurrent()">
            {{ messages.staleKeep }}
          </button>
          <button type="button" class="btn btn-primary btn-sm" (click)="overwriteNow()">
            {{ messages.staleOverwrite }}
          </button>
        </div>
      }

      <section>
        <h3>{{ messages.description }}</h3>
        @if (editing()) {
          <label class="sr-only" for="detail-description-input">{{
            messages.descriptionLabel
          }}</label>
          <textarea
            id="detail-description-input"
            class="input wide"
            rows="8"
            maxlength="5000"
            [value]="draftDescription()"
            (input)="draftDescription.set($any($event.target).value)"
          ></textarea>
        } @else {
          <p class="description">{{ feature().description || messages.noDescription }}</p>
        }
      </section>

      @if (editing()) {
        @if (editError()) {
          <p class="err" role="alert">{{ editError() }}</p>
        }
        <div class="actions">
          <button type="button" class="btn btn-primary" (click)="saveText()">
            {{ messages.save }}
          </button>
          <button type="button" class="btn btn-secondary" (click)="cancelEdit()">
            {{ messages.cancel }}
          </button>
        </div>
      } @else {
        @if (feature().criteria) {
          <section>
            <h3>{{ messages.values }}</h3>
            <ul class="values">
              @for (criterion of definition().criteria; track criterion.key) {
                <li [class.review]="isOutOfScale(criterion.key)">
                  <span>{{ criterion.code }} · {{ criterion.label }}</span>
                  <strong>{{ valueOf(criterion.key) }}</strong>
                </li>
              }
            </ul>
          </section>
        }
        @if (feature().score; as score) {
          <section>
            <h3>{{ messages.calculation }}</h3>
            @if (score.explanation) {
              <p class="explanation">{{ score.explanation }}</p>
            } @else {
              <p class="muted">{{ messages.notComputed }}</p>
            }
            <button type="button" class="link-button small" (click)="methodRequested.emit()">
              {{ messages.methodLink }}
            </button>
          </section>
        }
      }
    </app-side-panel>
  `,
})
export class FeatureDetailPanelComponent {
  protected readonly messages = MESSAGES.detail;

  readonly feature = input.required<Feature>();
  readonly definition = input.required<MethodDefinition>();
  readonly canAnimate = input(false);
  /** Vrai quand l'enregistrement demandé a été refusé pour version périmée (`STALE_VERSION`). */
  readonly stale = input(false);

  readonly closed = output<void>();
  readonly methodRequested = output<void>();
  /** Un seul envoi pour le titre et le descriptif. */
  readonly textSaved = output<TextEdit>();
  /** Enregistrer malgré la version périmée, avec le texte déjà saisi. */
  readonly overwrite = output<void>();
  readonly review = output<ReviewChange>();
  /** L'animateur garde la version actuelle : le refus n'a plus lieu d'être affiché. */
  readonly staleDismissed = output<void>();

  protected readonly editing = signal(false);
  protected readonly marking = signal(false);
  protected readonly reason = signal('');
  protected readonly draftTitle = signal('');
  protected readonly draftDescription = signal('');
  protected readonly editError = signal<string | null>(null);
  protected readonly savedMessage = signal(false);
  /** Version de la fonctionnalité au moment de l'envoi : un changement de version confirme l'enregistrement. */
  private sentVersion: number | null = null;
  /** La fonctionnalité au début de l'édition : version envoyée et texte de départ. */
  private base: Feature | null = null;

  protected readonly rankLabel = computed(() => {
    const rank = this.feature().score?.rank;
    return rank ? format(this.messages.rank, { rank }) : this.messages.unranked;
  });
  protected readonly staleLead = computed(() =>
    format(this.messages.staleLead, { title: this.feature().title }),
  );

  constructor() {
    effect(() => {
      const version = this.feature().version;
      if (this.sentVersion !== null && version !== this.sentVersion) {
        this.sentVersion = null;
        this.editing.set(false);
        this.savedMessage.set(true);
      }
    });
    effect(() => {
      // Le serveur a refusé l'enregistrement : la saisie reste à l'écran, avec la version actuelle à côté.
      if (this.stale() && untracked(this.canAnimate)) {
        this.sentVersion = null;
        this.savedMessage.set(false);
        this.editing.set(true);
      }
    });
    // Plus de droit de modifier (clôture, perte des droits) : le texte et la marque « à revoir » se referment.
    effect(() => {
      if (this.canAnimate()) return;
      untracked(() => {
        this.cancelEdit();
        this.marking.set(false);
        this.reason.set('');
      });
    });
  }

  protected isOutOfScale(key: string): boolean {
    return this.feature().score?.outOfScale.includes(key) ?? false;
  }

  protected valueOf(key: string): string {
    const value = this.feature().criteria?.[key];
    return value === null || value === undefined ? MESSAGES.board.noValue : String(value);
  }

  protected startEdit(): void {
    this.base = this.feature();
    this.draftTitle.set(this.feature().title);
    this.draftDescription.set(this.feature().description ?? '');
    this.editError.set(null);
    this.savedMessage.set(false);
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.sentVersion = null;
    this.editing.set(false);
    this.editError.set(null);
  }

  protected keepCurrent(): void {
    this.cancelEdit();
    this.staleDismissed.emit();
  }

  protected overwriteNow(): void {
    this.sentVersion = this.feature().version;
    this.overwrite.emit();
  }

  protected saveText(): void {
    const title = this.draftTitle().trim();
    const description = this.draftDescription();
    if (title === '' || [...title].length > TITLE_MAX) {
      this.editError.set(this.messages.titleRequired);
      return;
    }
    if ([...description].length > DESCRIPTION_MAX) {
      this.editError.set(this.messages.descriptionTooLong);
      return;
    }
    this.editError.set(null);
    const base = this.base ?? this.feature();
    const text = description.trim() === '' ? null : description;
    if (title === base.title && text === (base.description ?? null)) {
      // Rien n'a changé : aucun envoi, le serveur n'aurait rien à confirmer.
      this.cancelEdit();
      return;
    }
    this.sentVersion = this.feature().version;
    this.textSaved.emit({ baseVersion: base.version, title, description: text });
  }

  protected mark(): void {
    const reason = this.reason().trim();
    this.review.emit({
      marked: true,
      reason: reason === '' ? null : [...reason].slice(0, REASON_MAX).join(''),
    });
    this.marking.set(false);
    this.reason.set('');
  }
}
