import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

/**
 * Sigle d'un critère ou d'une valeur calculée (FR-016a) : souligné en pointillés, avec sa définition affichée au
 * survol, au focus clavier et au toucher, et annoncée aux lecteurs d'écran par `aria-label`. Le sigle, le nom et la
 * définition viennent de `methodDefinition`, jamais du composant.
 */
@Component({
  selector: 'app-criterion-term',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="term"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-describedby]="shown() ? tipId : null"
      (mouseenter)="shown.set(true)"
      (mouseleave)="shown.set(false)"
      (focus)="shown.set(true)"
      (blur)="shown.set(false)"
      (click)="shown.set(!shown())"
      (keydown.escape)="shown.set(false)"
    >
      {{ code() }}
    </button>
    @if (shown()) {
      <span class="term-tip" role="tooltip" [id]="tipId">{{ label() }} : {{ definition() }}</span>
    }
  `,
})
export class CriterionTermComponent {
  private static nextId = 0;
  protected readonly tipId = `term-tip-${CriterionTermComponent.nextId++}`;

  readonly code = input.required<string>();
  readonly label = input.required<string>();
  readonly definition = input.required<string>();
  protected readonly shown = signal(false);
  protected readonly ariaLabel = computed(
    () => `${this.code()}, ${this.label()} : ${this.definition()}`,
  );
}
