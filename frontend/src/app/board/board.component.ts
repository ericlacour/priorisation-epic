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
import { ScreenSizeService } from '../layout/screen-size.service';
import { CriterionTermComponent } from '../shared/criterion-term.component';
import {
  computedDisplay,
  criterionValue,
  isMasked,
  isOutOfScale,
  missingScore,
} from './feature-cells';
import { FeatureEditorComponent } from './feature-editor.component';

/**
 * Tableau des fonctionnalités (écrans 4 et 4 quinquies des maquettes, FR-014). Il affiche `sessionState.features`
 * **dans l'ordre reçu** (le serveur trie), avec une colonne par critère puis par valeur calculée de
 * `sessionState.methodDefinition` : aucune colonne n'est écrite en dur (FR-017b). Les identifiants ouvrent le panneau
 * de détail. L'animateur sur ordinateur (`editable`) ajoute, modifie et supprime ; les autres voient le même tableau
 * sans aucune action d'animation (FR-014b). Sur téléphone (moins de 600 px), le tableau devient une liste de cartes
 * en lecture seule. Seule la liste défile, avec un en-tête figé (FR-014a).
 */
@Component({
  selector: 'app-board',
  imports: [CriterionTermComponent, FeatureEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'board' },
  template: `
    @if (editable()) {
      <div class="actions board-actions" role="group" [attr.aria-label]="sessionMessages.actions">
        <button
          type="button"
          class="btn btn-secondary"
          [disabled]="editingId() !== null"
          (click)="startAdding()"
        >
          {{ messages.add }}
        </button>
      </div>
    }
    @if (screen.isPhone()) {
      <ul class="feature-cards" [attr.aria-label]="messages.tableLabel(definition().name)">
        @for (feature of features(); track feature.id) {
          <li class="fcard" [class.masked]="masked(feature)">
            <div class="row1">
              <span class="rank" [class.top]="feature.score?.rank === 1">{{ rank(feature) }}</span>
              <b class="card-title">
                <button type="button" class="fid" (click)="featureSelected.emit(feature.id)">
                  {{ feature.externalId }}
                </button>
                · {{ feature.title }}
              </b>
              @if (!masked(feature)) {
                <span class="wsjf-big" [class.wsjf-missing]="missing(feature) !== null">{{
                  lastComputed(feature)
                }}</span>
              }
            </div>
            @if (feature.markedForReview) {
              <span class="badge review" [attr.title]="messages.reviewTitle(feature.reviewReason)">
                {{ messages.review }}
              </span>
            }
            @if (masked(feature)) {
              <span class="badge vote">{{ messages.voting }}</span>
            } @else {
              @if (feature.votingInProgress) {
                <span class="badge vote">{{ messages.voting }}</span>
              }
              <div class="crit">
                @for (criterion of definition().criteria; track criterion.key) {
                  <span>
                    {{ criterion.code }}
                    <span [class.review]="outOfScale(feature, criterion.key)">{{
                      value(feature, criterion.key)
                    }}</span>
                  </span>
                }
                @for (computed of intermediateValues(); track computed.key) {
                  <span>{{ computed.code }} {{ computedText(feature, computed.key) }}</span>
                }
              </div>
            }
          </li>
        } @empty {
          <li class="muted">{{ messages.empty }}</li>
        }
        <li class="help">{{ state().formula }}</li>
      </ul>
    } @else {
      <div class="table-wrap">
        <table [attr.aria-label]="messages.tableLabel(definition().name)">
          <thead>
            <tr>
              <th scope="col">{{ messages.rank }}</th>
              <th scope="col">{{ messages.id }}</th>
              <th scope="col">{{ messages.title }}</th>
              @for (criterion of definition().criteria; track criterion.key) {
                <th scope="col" class="num"><app-criterion-term [term]="criterion" /></th>
              }
              @for (computed of definition().computedValues; track computed.key) {
                <th scope="col" class="num"><app-criterion-term [term]="computed" /></th>
              }
              @if (editable()) {
                <th scope="col">
                  <span class="sr-only">{{ messages.actions }}</span>
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @if (adding()) {
              <tr appFeatureEditor [state]="state()" (closed)="adding.set(false)"></tr>
            }
            @for (feature of features(); track feature.id) {
              @if (editable() && editingId() === feature.id) {
                <tr
                  appFeatureEditor
                  [state]="state()"
                  [feature]="feature"
                  (closed)="editingId.set(null)"
                ></tr>
              } @else {
                <tr
                  [class.masked]="masked(feature)"
                  [class.incomplete]="!masked(feature) && !feature.score?.computed"
                >
                  <td>
                    <span class="rank" [class.top]="feature.score?.rank === 1">{{
                      rank(feature)
                    }}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      class="fid"
                      [attr.title]="messages.openDetail(feature.externalId)"
                      (click)="featureSelected.emit(feature.id)"
                    >
                      {{ feature.externalId }}
                    </button>
                  </td>
                  <td class="title" [attr.title]="feature.title">
                    @if (feature.markedForReview) {
                      <span
                        class="badge review"
                        [attr.title]="messages.reviewTitle(feature.reviewReason)"
                        >{{ messages.review }}</span
                      >
                    }
                    {{ feature.title }}
                    @if (masked(feature) || feature.votingInProgress) {
                      <span class="badge vote">{{ messages.voting }}</span>
                    }
                  </td>
                  @if (masked(feature)) {
                    <td class="cell-mask" [attr.colspan]="valueColumns()">{{ messages.masked }}</td>
                  } @else {
                    @for (criterion of definition().criteria; track criterion.key) {
                      <td class="num">
                        @if (outOfScale(feature, criterion.key)) {
                          <span
                            class="review"
                            [attr.title]="messages.outOfScaleValue(state().scale.max)"
                            >{{ value(feature, criterion.key) }}</span
                          >
                        } @else {
                          {{ value(feature, criterion.key) }}
                        }
                      </td>
                    }
                    @for (
                      computed of definition().computedValues;
                      track computed.key;
                      let last = $last
                    ) {
                      <td class="num" [class.wsjf]="last && !!feature.score?.computed">
                        @if (last && missing(feature) === 'outOfScale') {
                          <span class="badge warn">{{ messages.outOfScale }}</span>
                        } @else {
                          {{ computedText(feature, computed.key, last) }}
                        }
                      </td>
                    }
                  }
                  @if (editable()) {
                    <td>
                      <button
                        type="button"
                        class="btn btn-ghost btn-sm"
                        [disabled]="editingId() !== null || adding() || !!feature.votingInProgress"
                        [attr.title]="feature.votingInProgress ? roundMessages.lockedEdit : null"
                        [attr.aria-label]="messages.editFeature(feature.externalId)"
                        (click)="editingId.set(feature.id)"
                      >
                        {{ messages.edit }}
                      </button>
                    </td>
                  }
                </tr>
              }
            } @empty {
              @if (!adding()) {
                <tr>
                  <td [attr.colspan]="totalColumns()" class="muted">
                    {{ messages.empty }}
                    @if (editable()) {
                      {{ messages.emptyFacilitator }}
                    }
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
      <p class="legend">{{ messages.legend }} {{ state().formula }}. {{ state().tieBreakRule }}</p>
    }
  `,
})
export class BoardComponent {
  protected readonly screen = inject(ScreenSizeService);
  protected readonly messages = MESSAGES.board;
  protected readonly sessionMessages = MESSAGES.session;
  protected readonly roundMessages = MESSAGES.rounds.vote;

  readonly state = input.required<SessionState>();
  /** Vrai pour l'animateur sur ordinateur : colonne « Modifier », ajout, suppression. */
  readonly editable = input(false);
  /** Un identifiant a été activé : ouvrir le panneau de détail de cette fonctionnalité. */
  readonly featureSelected = output<string>();

  protected readonly adding = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly features = computed(() => this.state().features);
  protected readonly definition = computed(() => this.state().methodDefinition);
  /** Valeurs calculées autres que la dernière : la dernière (le résultat) est déjà en gros sur la carte. */
  protected readonly intermediateValues = computed(() =>
    this.definition().computedValues.slice(0, -1),
  );
  protected readonly valueColumns = computed(
    () => this.definition().criteria.length + this.definition().computedValues.length,
  );
  protected readonly totalColumns = computed(
    () => 3 + this.valueColumns() + (this.editable() ? 1 : 0),
  );

  protected startAdding(): void {
    this.editingId.set(null);
    this.adding.set(true);
  }

  protected masked(feature: Feature): boolean {
    return isMasked(feature);
  }

  protected rank(feature: Feature): string {
    const rank = feature.score?.rank;
    return rank == null ? this.messages.none : String(rank);
  }

  protected value(feature: Feature, key: string): string {
    return String(criterionValue(feature, key) ?? this.messages.none);
  }

  protected outOfScale(feature: Feature, key: string): boolean {
    return isOutOfScale(feature, key);
  }

  protected missing(feature: Feature): 'outOfScale' | 'notComputed' | null {
    return missingScore(feature);
  }

  /** Valeur calculée affichée telle que reçue ; « non calculé » dans la dernière colonne, « — » dans les autres. */
  protected computedText(feature: Feature, key: string, last = false): string {
    return computedDisplay(feature, key) ?? (last ? this.messages.notComputed : this.messages.none);
  }

  /** Dernière valeur calculée de la méthode (le résultat final, par exemple le WSJF), pour les cartes. */
  protected lastComputed(feature: Feature): string {
    const computed = this.definition().computedValues;
    const last = computed[computed.length - 1];
    if (!last) return '';
    return this.missing(feature) === 'outOfScale'
      ? this.messages.outOfScale
      : this.computedText(feature, last.key, true);
  }
}
