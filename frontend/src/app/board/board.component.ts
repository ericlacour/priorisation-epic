import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { CriteriaChanges } from '../api/contract';
import { Feature } from '../api/session-state';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';
import { ScreenSizeService } from '../layout/screen-size.service';
import { AnimationLinkComponent } from '../session/animation-link.component';
import { SessionRoomService } from '../session/session-room.service';
import { CriterionTermComponent } from '../shared/criterion-term.component';
import { LinkBoxComponent } from '../shared/link-box.component';
import { MethodGlossaryComponent } from '../shared/method-glossary.component';
import { MethodPanelComponent } from '../shared/method-panel.component';
import {
  FeatureDetailPanelComponent,
  ReviewChange,
  TextEdit,
} from './feature-detail-panel.component';
import { FeatureEdit, FeatureEditorComponent } from './feature-editor.component';

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
 * (FR-014b). Tient dans la fenêtre sans défilement de la page : seule la liste défile, en-tête figé (FR-014a).
 * Sur téléphone, des cartes en lecture seule remplacent le tableau.
 */
@Component({
  selector: 'app-board',
  imports: [
    AnimationLinkComponent,
    CriterionTermComponent,
    FeatureDetailPanelComponent,
    FeatureEditorComponent,
    LinkBoxComponent,
    MethodGlossaryComponent,
    MethodPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'board-page', role: 'main' },
  template: `
    @if (state(); as state) {
      <div class="board-head">
        <div>
          <h1>{{ state.name }}</h1>
          <p class="muted small">{{ infoLine() }}</p>
        </div>
        <span class="badge" [class]="statusClass()">{{ statusLabel() }}</span>
      </div>

      @if (room.connection() === 'lost') {
        <p class="notice danger" role="status">{{ connectionMessage }}</p>
      }

      @if (canAnimate() && !screen.isPhone()) {
        <div class="board-actions">
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="editing() !== null"
            (click)="startNew()"
          >
            {{ messages.addFeature }}
          </button>
        </div>
      } @else if (!canAnimate()) {
        <p class="notice info" role="note">{{ messages.noRound }}</p>
        <div class="board-actions">
          <button type="button" class="btn btn-secondary" disabled [attr.title]="messages.soon">
            {{ messages.export }}
          </button>
          <button type="button" class="btn btn-secondary" disabled [attr.title]="messages.soon">
            {{ messages.revealedRounds }}
          </button>
        </div>
      }

      @if (refusalText(); as text) {
        <p class="notice danger" role="alert">{{ text }}</p>
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

      <div class="layout-board">
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
                    @for (computed of state.methodDefinition.computedValues; track computed.key) {
                      <th class="num">
                        <app-criterion-term
                          [code]="computed.code"
                          [label]="computed.label"
                          [definition]="computed.definition"
                        />
                      </th>
                    }
                    @if (canAnimate()) {
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
                        (removed)="remove(feature)"
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
                        <td class="title">
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
                        @if (canAnimate()) {
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
                          @if (canAnimate()) {
                            {{ messages.emptyFacilitator }}
                          }
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
            <p class="legend">
              {{ state.formula }} · {{ state.tieBreakRule }} {{ messages.legend }}
            </p>
          }
        </div>

        <aside class="side">
          <div class="card">
            <h2>{{ participantsTitle() }}</h2>
            <ul class="plist">
              @for (participant of state.participants; track participant.participantId) {
                <li>
                  <span
                    class="dot"
                    [class.on]="participant.online"
                    [class.off]="!participant.online"
                  ></span>
                  {{ participant.pseudo }}
                  @if (participant.participantId === state.me?.participantId) {
                    {{ messages.youSuffix }}
                  }
                  <span class="role">{{ roleOf(participant) }}</span>
                </li>
              }
            </ul>
          </div>
          <div class="card">
            <h2>{{ messages.invite }}</h2>
            <app-link-box [url]="inviteUrl()" />
            @if (canAnimate() && !screen.isPhone()) {
              <app-animation-link [sessionId]="state.sessionId" />
            }
          </div>
          <app-method-glossary
            [definition]="state.methodDefinition"
            (methodRequested)="showMethod.set(true)"
          />
        </aside>
      </div>

      @if (selected(); as feature) {
        <app-feature-detail-panel
          [feature]="feature"
          [definition]="state.methodDefinition"
          [canAnimate]="canAnimate()"
          [stale]="detailStale()"
          (closed)="selectedId.set(null)"
          (methodRequested)="showMethod.set(true)"
          (textSaved)="saveText(feature, $event)"
          (overwrite)="overwriteText(feature)"
          (staleDismissed)="room.clearRefusal()"
          (review)="changeReview(feature, $event)"
        />
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
  protected readonly room = inject(SessionRoomService);
  protected readonly screen = inject(ScreenSizeService);
  private readonly document = inject(DOCUMENT);

  protected readonly messages = MESSAGES.board;
  protected readonly conflictMessages = MESSAGES.conflict;
  protected readonly connectionMessage = MESSAGES.connection.reconnecting;
  protected readonly newRow = NEW_ROW;

  protected readonly state = this.room.state;
  protected readonly canAnimate = this.room.canAnimate;
  /** Identifiant de la ligne en édition, ou `'new'` pour l'ajout. */
  protected readonly editing = signal<string | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly showMethod = signal(false);
  private readonly frozenOrder = signal<readonly string[] | null>(null);
  private readonly pending = signal<PendingUpdate | null>(null);
  /** Ce que la ligne en édition attend du serveur, pour la refermer à la confirmation. */
  private awaiting:
    | { id: string; version: number }
    | { id: 'new'; externalId: string }
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

  protected readonly refusalText = computed(() => {
    const refusal = this.room.refusal();
    if (!refusal || (refusal.code === 'STALE_VERSION' && this.pending())) return null;
    return MESSAGES.intentErrors[refusal.code];
  });

  protected readonly columnCount = computed(() => {
    const definition = this.state()?.methodDefinition;
    return (
      3 +
      (definition?.criteria.length ?? 0) +
      (definition?.computedValues.length ?? 0) +
      (this.canAnimate() ? 1 : 0)
    );
  });

  protected readonly inviteUrl = computed(
    () => `${this.document.location.origin}/s/${this.state()?.sessionId ?? ''}`,
  );

  constructor() {
    // Un nouvel état confirme l'enregistrement ou la suppression en attente : la ligne en édition se referme.
    effect(() => {
      const state = this.state();
      const waiting = this.awaiting;
      if (!state || !waiting) return;
      const feature = state.features.find((candidate) =>
        'externalId' in waiting
          ? candidate.externalId === waiting.externalId
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
    // Une fonctionnalité supprimée par un autre poste ferme son panneau de détail.
    effect(() => {
      const id = this.selectedId();
      const state = this.state();
      if (id !== null && state && !state.features.some((feature) => feature.id === id)) {
        this.selectedId.set(null);
      }
    });
  }

  protected statusLabel(): string {
    return this.messages.status[this.state()?.status ?? 'PREPARATION'];
  }

  protected statusClass(): string {
    return this.state()?.status === 'IN_PROGRESS'
      ? 'badge live'
      : this.state()?.status === 'CLOSED'
        ? 'badge closed'
        : 'badge prep';
  }

  protected infoLine(): string {
    const state = this.state();
    if (!state) return '';
    const facilitator = state.participants.find((p) => p.role === 'FACILITATOR')?.pseudo ?? '';
    const me = state.me?.pseudo ?? '';
    return this.canAnimate()
      ? format(this.messages.facilitatorLine, { facilitator, me, max: state.scale.max })
      : format(this.messages.participantLine, { facilitator, me, max: state.scale.max });
  }

  protected participantsTitle(): string {
    return format(this.messages.participants, { count: this.state()?.participants.length ?? 0 });
  }

  protected roleOf(participant: { role: string; online: boolean }): string {
    return participant.role === 'FACILITATOR'
      ? this.messages.animator
      : participant.online
        ? ''
        : this.messages.offline;
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
    return format(this.messages.outOfScaleValue, { max: this.state()?.scale.max ?? 0 });
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
    if (sent) this.awaiting = { id: 'new', externalId: edit.externalId ?? '' };
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

  protected remove(feature: Feature): void {
    this.pending.set(null);
    const sent = this.room.deleteFeature({ featureId: feature.id, version: feature.version });
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
    this.room.updateFeature({ featureId: feature.id, version: feature.version, ...payload });
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
