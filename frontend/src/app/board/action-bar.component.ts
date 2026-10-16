import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { MESSAGES } from '../i18n/messages.fr';

/**
 * Barre d'actions (FR-014c), sur une ligne, sous la barre de session. Pour l'animateur, les actions directes en
 * groupes : saisie (« + Fonctionnalité », action principale, et « Prioriser par classement »), puis préparation
 * (« Importer », « Échelle ») ; les groupes « tours » et « cycle de vie » s'ajoutent avec US5 et le vote masqué. Une
 * action indisponible reste à sa place, désactivée. Pour un participant, un bandeau d'état de même hauteur.
 */
@Component({
  selector: 'app-action-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'action-bar',
    '[attr.role]': "animate() ? 'toolbar' : 'status'",
    '[attr.aria-label]': 'label()',
  },
  template: `
    @if (animate()) {
      <div class="action-group" role="group" [attr.aria-label]="messages.groups.entry">
        <button type="button" class="btn btn-primary" [disabled]="editing()" (click)="add.emit()">
          {{ messages.addFeature }}
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          [attr.title]="messages.rankHint"
          [disabled]="editing() || !hasFeatures()"
          (click)="rank.emit()"
        >
          {{ messages.rank }}
        </button>
      </div>
      <div class="action-group" role="group" [attr.aria-label]="messages.groups.preparation">
        <button
          type="button"
          class="btn btn-secondary"
          [attr.title]="messages.importHint"
          [disabled]="editing()"
          (click)="import.emit()"
        >
          {{ messages.import }}
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          [attr.title]="messages.scaleHint"
          [disabled]="editing()"
          (click)="scale.emit()"
        >
          {{ messages.scale }}
        </button>
      </div>
    } @else {
      <p class="action-info">
        <span class="ico" aria-hidden="true">i</span>
        <span>{{ messages.noRound }}</span>
      </p>
    }
  `,
})
export class ActionBarComponent {
  /** Vrai pour l'animateur : actions d'animation ; faux : bandeau d'état du participant. */
  readonly animate = input.required<boolean>();
  /** Une ligne est en édition : les actions attendent qu'elle soit enregistrée ou annulée. */
  readonly editing = input(false);
  /** « Prioriser par classement » demande au moins une fonctionnalité. */
  readonly hasFeatures = input(false);

  readonly add = output<void>();
  readonly rank = output<void>();
  readonly import = output<void>();
  readonly scale = output<void>();

  protected readonly messages = MESSAGES.board;
  protected readonly label = computed(() =>
    this.animate() ? this.messages.actionsLabel : this.messages.stateLabel,
  );
}
