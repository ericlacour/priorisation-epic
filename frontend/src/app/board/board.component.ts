import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  output,
  signal,
  untracked,
} from '@angular/core';

import { CriteriaChanges } from '../api/contract';
import { Feature } from '../api/session-state';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';
import { ImportDialogComponent } from '../import-export/import-dialog.component';
import { ScreenSizeService } from '../layout/screen-size.service';
import { SessionRoomService } from '../session/session-room.service';
import { SettingsDialogComponent } from '../session/settings-dialog.component';
import { CriterionTermComponent } from '../shared/criterion-term.component';
import { MethodGlossaryComponent } from '../shared/method-glossary.component';
import { MethodInfoComponent } from '../shared/method-info.component';
import { MethodPanelComponent } from '../shared/method-panel.component';
import {
  FeatureDetailPanelComponent,
  ReviewChange,
  TextEdit,
} from './feature-detail-panel.component';
import { FeatureEdit, FeatureEditorComponent } from './feature-editor.component';
import { SessionBarComponent } from '../session/session-bar.component';
import { SessionChromeService } from '../layout/session-chrome.service';
import { ActionBarComponent } from './action-bar.component';
import { scaleLabel } from '../shared/scale';

/** Ce que le dernier envoi voulait faire, pour proposer « Remplacer par les miennes » après un conflit. */
interface PendingUpdate {
  readonly kind: 'row' | 'detail';
  readonly featureId: string;
  readonly payload: {
    readonly title?: string;
    readonly description?: string | null;
    readonly criteria?: CriteriaChanges;
  };
}

/** `edit.id` vaut `'new'` pour la ligne d'ajout. */
const NEW_ROW = 'new';

/**
 * Tableau de priorisation (US1) : les fonctionnalités dans l'ordre reçu du serveur, avec une colonne par critère puis
 * par valeur calculée de `methodDefinition` (aucune colonne écrite en dur, FR-017b). Il ne calcule et ne trie rien.
 * L'animateur ajoute, modifie et supprime ; un participant voit le même tableau sans aucune action d'animation
 * (FR-014b). Au-dessus, la barre de session et la barre d'actions, d'une ligne chacune (FR-014c). Tient dans la
 * fenêtre sans défilement de la page : seule la liste défile, en-tête figé ; une ligne par fonctionnalité, titre
 * tronqué et en entier au survol, pour voir au moins 15 fonctionnalités (FR-014a). Les messages se superposent au
 * tableau sans le décaler. Les définitions de la méthode s'ouvrent dans un panneau : le tableau garde toute la largeur
 * (FR-016a).
 * Sur téléphone, des cartes en lecture seule remplacent le tableau.
 */
@Component({
  selector: 'app-board',
  imports: [
    CriterionTermComponent,
    FeatureDetailPanelComponent,
    FeatureEditorComponent,
    ImportDialogComponent,
    MethodGlossaryComponent,
    MethodInfoComponent,
    MethodPanelComponent,
    SessionBarComponent,
    ActionBarComponent,
    SettingsDialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'board-page board-screen', role: 'main' },
  template: `
    @if (state(); as state) {
      <!-- Deux barres d'une ligne (FR-014c) ; toute la hauteur restante va au tableau (FR-014a). -->
      <app-session-bar (glossaryRequested)="showGlossary.set(true)" />
      <!-- Sur téléphone (lecture seule), la barre se réduit au bandeau d'état, animateur compris (FR-014c). -->
      <app-action-bar
        [animate]="canAnimate() && !screen.isPhone()"
        [editing]="editing() !== null"
        [hasFeatures]="state.features.length > 0"
        [closed]="state.status === 'CLOSED'"
        (add)="startNew()"
        (rank)="rankingRequested.emit()"
        (import)="openImport()"
        (scale)="openSettings()"
      />

      <div class="layout-board">
        <!-- Messages en superposition : ils ne décalent pas le tableau (FR-014c). -->
        <div class="board-messages">
          @if (room.connection() === 'lost') {
            <p class="notice danger" role="status">{{ connectionMessage }}</p>
          }
          @if (refusalText(); as text) {
            <p class="notice danger" role="alert">{{ text }}</p>
          }
          @if (rankingEndText(); as text) {
            <div class="notice info toast" role="status">
              <span>{{ text }}</span>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                (click)="room.dismissRankingEnd()"
              >
                {{ liveMessages.dismiss }}
              </button>
            </div>
          }
          @if (conflict(); as conflict) {
            <div class="notice danger toast" role="alert">
              <span> {{ conflictTitle(conflict) }} {{ conflictCurrent(conflict) }} </span>
              <button type="button" class="btn btn-secondary btn-sm" (click)="keepCurrentValues()">
                {{ conflictMessages.keep }}
              </button>
              <button type="button" class="btn btn-primary btn-sm" (click)="replaceWithMine()">
                {{ conflictMessages.replace }}
              </button>
            </div>
          }
        </div>
        <div class="board-main">
          @if (screen.isPhone()) {
            <div class="feature-cards">
              @for (feature of displayed(); track feature.id) {
                <article class="fcard">
                  <div class="row1">
                    @if (rankOf(feature); as rank) {
                      <span class="rank">{{ rank }}</span>
                    }
                    <button type="button" class="fid" (click)="openDetail(feature)">
                      {{ feature.externalId }}
                    </button>
                    <b>{{ feature.title }}</b>
                    @if (feature.markedForReview) {
                      <span class="badge review" [attr.title]="reviewHint(feature)">{{
                        messages.review
                      }}</span>
                    }
                    <span class="wsjf-big">{{ mainValue(feature) }}</span>
                  </div>
                  <div class="crit">
                    @for (criterion of state.methodDefinition.criteria; track criterion.key) {
                      <span [class.review]="isOutOfScale(feature, criterion.key)">
                        {{ criterion.code }} {{ valueOf(feature, criterion.key) }}
                      </span>
                    }
                    @for (computed of state.methodDefinition.computedValues; track computed.key) {
                      <span>{{ computed.code }} {{ computedOf(feature, computed.key) }}</span>
                    }
                  </div>
                </article>
              } @empty {
                <p class="muted">{{ messages.empty }}</p>
              }
            </div>
          } @else {
            <div
              class="table-wrap"
              role="region"
              tabindex="0"
              [attr.aria-label]="messages.tableLabel"
            >
              <table [attr.aria-label]="messages.tableLabel" class="board-table">
                <thead>
                  <tr>
                    <th>{{ messages.columns.rank }}</th>
                    <th>{{ messages.columns.externalId }}</th>
                    <th>{{ messages.columns.title }}</th>
                    @for (criterion of state.methodDefinition.criteria; track criterion.key) {
                      <th class="num">
                        <app-criterion-term
                          [code]="criterion.code"
                          [label]="criterion.label"
                          [definition]="criterion.definition"
                        />
                      </th>
                    }
                    @for (
                      computed of state.methodDefinition.computedValues;
                      track computed.key;
                      let last = $last
                    ) {
                      <th class="num">
                        <app-criterion-term
                          [code]="computed.code"
                          [label]="computed.label"
                          [definition]="computed.definition"
                        />
                        @if (last) {
                          <app-method-info
                            [formula]="state.formula"
                            [tieBreakRule]="state.tieBreakRule"
                          />
                        }
                      </th>
                    }
                    @if (canEdit()) {
                      <th>{{ messages.columns.actions }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @if (editing() === newRow) {
                    <tr
                      appFeatureEditor
                      [definition]="state.methodDefinition"
                      [scale]="state.scale"
                      (saved)="saveNew($event)"
                      (cancelled)="stopEditing()"
                    ></tr>
                  }
                  @for (feature of displayed(); track feature.id) {
                    @if (editing() === feature.id) {
                      <tr
                        appFeatureEditor
                        [feature]="feature"
                        [definition]="state.methodDefinition"
                        [scale]="state.scale"
                        (saved)="saveRow(feature, $event)"
                        (cancelled)="stopEditing()"
                        (removed)="remove(feature, $event)"
                      ></tr>
                    } @else {
                      <tr [class.incomplete]="!feature.score?.complete">
                        <td>
                          @if (rankOf(feature); as rank) {
                            <span class="rank">{{ rank }}</span>
                          } @else {
                            {{ messages.noValue }}
                          }
                        </td>
                        <td>
                          <button
                            type="button"
                            class="fid"
                            [attr.title]="detailHint(feature)"
                            (click)="openDetail(feature)"
                          >
                            {{ feature.externalId }}
                          </button>
                        </td>
                        <td class="title" [attr.title]="feature.title">
                          @if (feature.markedForReview) {
                            <span class="badge review" [attr.title]="reviewHint(feature)">{{
                              messages.review
                            }}</span>
                          }
                          {{ feature.title }}
                        </td>
                        @for (criterion of state.methodDefinition.criteria; track criterion.key) {
                          <td class="num">
                            @if (isOutOfScale(feature, criterion.key)) {
                              <span class="review" [attr.title]="outOfScaleHint()">{{
                                valueOf(feature, criterion.key)
                              }}</span>
                            } @else {
                              {{ valueOf(feature, criterion.key) }}
                            }
                          </td>
                        }
                        @for (
                          computed of state.methodDefinition.computedValues;
                          track computed.key;
                          let last = $last
                        ) {
                          <td class="num" [class.wsjf]="last">
                            @if (last && !feature.score?.complete) {
                              @if (feature.score?.outOfScale?.length) {
                                <span class="badge warn">{{ messages.outOfScale }}</span>
                              } @else {
                                {{ messages.notComputed }}
                              }
                            } @else {
                              {{ computedOf(feature, computed.key) }}
                            }
                          </td>
                        }
                        @if (canEdit()) {
                          <td>
                            <button
                              type="button"
                              class="btn btn-ghost btn-sm"
                              [disabled]="editing() !== null"
                              (click)="startEdit(feature)"
                            >
                              {{ messages.edit }}
                            </button>
                          </td>
                        }
                      </tr>
                    }
                  } @empty {
                    @if (editing() !== newRow) {
                      <tr>
                        <td [attr.colspan]="columnCount()" class="muted">
                          {{ messages.empty }}
                          @if (canEdit()) {
                            {{ messages.emptyFacilitator }}
                          }
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </div>

      @if (selected(); as feature) {
        <app-feature-detail-panel
          [feature]="feature"
          [definition]="state.methodDefinition"
          [canAnimate]="canEdit()"
          [stale]="detailStale()"
          (closed)="selectedId.set(null)"
          (methodRequested)="showMethod.set(true)"
          (textSaved)="saveText(feature, $event)"
          (overwrite)="overwriteText(feature)"
          (staleDismissed)="room.clearRefusal()"
          (review)="changeReview(feature, $event)"
        />
      }
      @if (showGlossary()) {
        <app-method-glossary
          [definition]="state.methodDefinition"
          (closed)="showGlossary.set(false)"
          (methodRequested)="showGlossary.set(false); showMethod.set(true)"
        />
      }
      @if (showImport()) {
        <app-import-dialog (closed)="showImport.set(false)" />
      }
      @if (showSettings()) {
        <app-settings-dialog (closed)="showSettings.set(false)" />
      }
      @if (showMethod()) {
        <app-method-panel
          [definition]="state.methodDefinition"
          [scale]="state.scale"
          (closed)="showMethod.set(false)"
        />
      }
    }
  `,
})
export class BoardComponent {
  /** L'animateur ouvre l'écran « Prioriser par classement » (FR-015a). */
  readonly rankingRequested = output<void>();

  protected readonly room = inject(SessionRoomService);
  protected readonly screen = inject(ScreenSizeService);

  protected readonly messages = MESSAGES.board;
  protected readonly conflictMessages = MESSAGES.conflict;
  protected readonly connectionMessage = MESSAGES.connection.reconnecting;
  protected readonly newRow = NEW_ROW;

  protected readonly state = this.room.state;
  protected readonly canAnimate = this.room.canAnimate;
  /** L'animateur d'une session qui n'est pas clôturée : en lecture seule, ni édition, ni import, ni échelle. */
  protected readonly canEdit = this.room.canEdit;
  /** Identifiant de la ligne en édition, ou `'new'` pour l'ajout. */
  protected readonly editing = signal<string | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly showMethod = signal(false);
  /** Panneau « Comprendre le <méthode> », ouvert depuis le lien au-dessus du tableau (FR-016a). */
  protected readonly showGlossary = signal(false);
  /** Fenêtres de l'animateur : import par fichier (FR-007) et échelle (FR-010). */
  protected readonly showImport = signal(false);
  protected readonly showSettings = signal(false);
  private readonly frozenOrder = signal<readonly string[] | null>(null);
  private readonly pending = signal<PendingUpdate | null>(null);
  /** Ce que la ligne en édition attend du serveur, pour la refermer à la confirmation. */
  private awaiting:
    | { id: string; version: number }
    | { id: 'new'; externalId: string; known: ReadonlySet<string> }
    | { id: string; removed: true }
    | null = null;

  /**
   * Les fonctionnalités dans l'ordre du serveur. Pendant l'édition d'une ligne, l'ordre de départ est conservé :
   * le tableau ne se retrie qu'à l'enregistrement (FR-015) et la ligne en cours de saisie ne bouge pas.
   */
  protected readonly displayed = computed<readonly Feature[]>(() => {
    const features = this.state()?.features ?? [];
    const frozen = this.frozenOrder();
    if (!frozen) return features;
    const position = (feature: Feature): number => {
      const index = frozen.indexOf(feature.id);
      return index === -1 ? frozen.length : index;
    };
    return [...features].sort((a, b) => position(a) - position(b));
  });

  protected readonly selected = computed(
    () => this.state()?.features.find((feature) => feature.id === this.selectedId()) ?? null,
  );

  protected readonly conflict = computed(() => {
    const refusal = this.room.refusal();
    const pending = this.pending();
    if (refusal?.code !== 'STALE_VERSION' || !pending || pending.kind !== 'row') return null;
    const current = this.state()?.features.find((feature) => feature.id === pending.featureId);
    return current ? { current, pending } : null;
  });

  protected readonly detailStale = computed(() => {
    const refusal = this.room.refusal();
    const pending = this.pending();
    return refusal?.code === 'STALE_VERSION' && pending?.kind === 'detail';
  });

  /** Pourquoi le classement suivi en direct s'est arrêté (FR-015b) ; l'animateur, lui, le sait déjà. */
  protected readonly rankingEndText = computed(() => {
    const end = this.room.rankingEnd();
    return end && !this.room.canAnimate() ? MESSAGES.liveRanking.ended[end] : null;
  });
  protected readonly liveMessages = MESSAGES.liveRanking;

  protected readonly refusalText = computed(() => {
    const refusal = this.room.refusal();
    // La fenêtre de l'échelle affiche elle-même ses refus.
    if (!refusal || (refusal.code === 'STALE_VERSION' && this.pending()) || this.showSettings()) {
      return null;
    }
    return MESSAGES.intentErrors[refusal.code];
  });

  protected readonly columnCount = computed(() => {
    const definition = this.state()?.methodDefinition;
    return (
      3 +
      (definition?.criteria.length ?? 0) +
      (definition?.computedValues.length ?? 0) +
      (this.canEdit() ? 1 : 0)
    );
  });

  constructor() {
    // La barre de session remplace la barre de l'application tant que le tableau est affiché (FR-014c).
    const chrome = inject(SessionChromeService);
    chrome.show();
    inject(DestroyRef).onDestroy(() => chrome.hide());
    // Un nouvel état confirme l'enregistrement ou la suppression en attente : la ligne en édition se referme.
    effect(() => {
      const state = this.state();
      const waiting = this.awaiting;
      if (!state || !waiting) return;
      // Pour un ajout, seule une fonctionnalité absente à l'envoi le confirme : celle qui porte déjà l'identifiant
      // (refus DUPLICATE_EXTERNAL_ID) ne referme pas la ligne.
      const feature = state.features.find((candidate) =>
        'externalId' in waiting
          ? candidate.externalId === waiting.externalId && !waiting.known.has(candidate.id)
          : candidate.id === waiting.id,
      );
      const confirmed =
        'removed' in waiting
          ? feature === undefined
          : 'version' in waiting
            ? feature !== undefined && feature.version !== waiting.version
            : feature !== undefined;
      if (confirmed) {
        this.awaiting = null;
        this.stopEditing();
      }
    });
    // La session passe en lecture seule (clôture, perte des droits) : l'édition et les fenêtres d'animation se ferment.
    effect(() => {
      if (this.canEdit()) return;
      untracked(() => {
        if (this.editing() !== null) this.stopEditing();
        this.showImport.set(false);
        this.showSettings.set(false);
      });
    });
    // Une fonctionnalité supprimée par un autre poste ferme son panneau de détail et sa ligne en édition.
    effect(() => {
      const state = this.state();
      if (!state) return;
      const exists = (id: string) => state.features.some((feature) => feature.id === id);
      const id = this.selectedId();
      if (id !== null && !exists(id)) {
        this.selectedId.set(null);
      }
      const edited = this.editing();
      if (edited !== null && edited !== NEW_ROW && !exists(edited)) {
        // Le refus éventuel (STALE_VERSION) s'affiche alors en message simple : il n'y a plus de conflit à résoudre.
        this.pending.set(null);
        this.stopEditing();
      }
    });
  }

  protected rankOf(feature: Feature): number | null {
    return feature.score?.complete ? (feature.score.rank ?? null) : null;
  }

  protected valueOf(feature: Feature, key: string): string {
    const value = feature.criteria?.[key];
    return value === null || value === undefined ? this.messages.noValue : String(value);
  }

  protected isOutOfScale(feature: Feature, key: string): boolean {
    return feature.score?.outOfScale.includes(key) ?? false;
  }

  protected computedOf(feature: Feature, key: string): string {
    return feature.score?.computed?.[key]?.display ?? this.messages.noValue;
  }

  /** La dernière valeur calculée est la valeur principale (en WSJF : le WSJF), affichée en grand sur les cartes. */
  protected mainValue(feature: Feature): string {
    const definition = this.state()?.methodDefinition;
    const last = definition?.computedValues[definition.computedValues.length - 1];
    if (!last) return '';
    if (feature.score?.complete) return this.computedOf(feature, last.key);
    return feature.score?.outOfScale.length ? this.messages.outOfScale : this.messages.notComputed;
  }

  protected reviewHint(feature: Feature): string {
    return format(this.messages.reviewHint, { reason: feature.reviewReason ?? '' }).replace(
      / : $/,
      '',
    );
  }

  protected detailHint(feature: Feature): string {
    return format(this.messages.openDetail, { id: feature.externalId });
  }

  protected outOfScaleHint(): string {
    const scale = this.state()?.scale;
    return format(this.messages.outOfScaleValue, { scale: scale ? scaleLabel(scale) : '' });
  }

  protected conflictTitle(conflict: { current: Feature }): string {
    return format(this.conflictMessages.title, { id: conflict.current.externalId });
  }

  protected conflictCurrent(conflict: { current: Feature }): string {
    const definition = this.state()?.methodDefinition;
    const values = (definition?.criteria ?? [])
      .map((criterion) => `${criterion.code} ${this.valueOf(conflict.current, criterion.key)}`)
      .join(', ');
    return format(this.conflictMessages.current, { values });
  }

  protected openImport(): void {
    this.room.clearRefusal();
    this.showImport.set(true);
  }

  protected openSettings(): void {
    this.room.clearRefusal();
    this.showSettings.set(true);
  }

  protected openDetail(feature: Feature): void {
    this.selectedId.set(feature.id);
  }

  // --- Édition --------------------------------------------------------------------------------------

  protected startNew(): void {
    this.room.clearRefusal();
    this.freeze();
    this.editing.set(NEW_ROW);
  }

  protected startEdit(feature: Feature): void {
    this.room.clearRefusal();
    this.freeze();
    this.editing.set(feature.id);
  }

  protected stopEditing(): void {
    this.editing.set(null);
    this.frozenOrder.set(null);
    this.awaiting = null;
  }

  private freeze(): void {
    this.frozenOrder.set((this.state()?.features ?? []).map((feature) => feature.id));
  }

  protected saveNew(edit: FeatureEdit): void {
    this.pending.set(null);
    const sent = this.room.addFeature({
      externalId: edit.externalId ?? '',
      title: edit.title ?? '',
      ...(Object.keys(edit.criteria).length > 0 ? { criteria: edit.criteria } : {}),
    });
    if (sent) {
      const known = new Set((this.state()?.features ?? []).map((feature) => feature.id));
      this.awaiting = { id: 'new', externalId: edit.externalId ?? '', known };
    }
  }

  protected saveRow(feature: Feature, edit: FeatureEdit): void {
    const payload = {
      ...(edit.title === undefined ? {} : { title: edit.title }),
      ...(Object.keys(edit.criteria).length > 0 ? { criteria: edit.criteria } : {}),
    };
    this.pending.set({ kind: 'row', featureId: feature.id, payload });
    // La version envoyée est celle du début de l'édition : si un autre poste a modifié la ligne entre-temps,
    // le serveur répond STALE_VERSION au lieu d'écraser en silence.
    const version = edit.baseVersion ?? feature.version;
    const sent = this.room.updateFeature({ featureId: feature.id, version, ...payload });
    if (sent) this.awaiting = { id: feature.id, version };
  }

  /** `version` est celle du début de l'édition : une ligne modifiée entre-temps n'est pas supprimée en silence. */
  protected remove(feature: Feature, version: number): void {
    this.pending.set(null);
    const sent = this.room.deleteFeature({ featureId: feature.id, version });
    if (sent) this.awaiting = { id: feature.id, removed: true };
  }

  // --- Conflit de version ---------------------------------------------------------------------------

  protected keepCurrentValues(): void {
    this.room.clearRefusal();
    this.pending.set(null);
    this.stopEditing();
  }

  protected replaceWithMine(): void {
    const conflict = this.conflict();
    if (!conflict) return;
    const { current, pending } = conflict;
    this.pending.set(pending);
    const sent = this.room.updateFeature({
      featureId: current.id,
      version: current.version,
      ...pending.payload,
    });
    if (sent) this.awaiting = { id: current.id, version: current.version };
  }

  // --- Panneau de détail ----------------------------------------------------------------------------

  protected saveText(feature: Feature, edit: TextEdit): void {
    const payload = { title: edit.title, description: edit.description };
    this.pending.set({ kind: 'detail', featureId: feature.id, payload });
    // Version du début de l'édition : une modification d'un autre poste entre-temps donne STALE_VERSION.
    this.room.updateFeature({ featureId: feature.id, version: edit.baseVersion, ...payload });
  }

  protected overwriteText(feature: Feature): void {
    const pending = this.pending();
    if (!pending || pending.kind !== 'detail') return;
    this.room.updateFeature({
      featureId: feature.id,
      version: feature.version,
      ...pending.payload,
    });
  }

  protected changeReview(feature: Feature, change: ReviewChange): void {
    this.pending.set(null);
    this.room.updateFeature({
      featureId: feature.id,
      version: feature.version,
      markedForReview: change.marked,
      reviewReason: change.marked ? change.reason : null,
    });
  }
}
