import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

import { CriterionDefinition } from '../api/contract';
import { MESSAGES } from '../i18n/messages.fr';

/**
 * Sigle d'un critère ou d'une valeur calculée (FR-016a) : souligné en pointillés, avec sa définition affichée au
 * survol, au focus clavier et au toucher (un appui bascule), et annoncée aux lecteurs d'écran par `aria-label`. Le
 * sigle, le nom et la définition viennent de `methodDefinition`, jamais du code.
 */
@Component({
  selector: 'app-criterion-term',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'term-wrap' },
  template: `
    <button
      type="button"
      class="term"
      [attr.aria-label]="ariaLabel()"
      (mouseenter)="show()"
      (mouseleave)="hide()"
      (focus)="show()"
      (blur)="hide()"
      (click)="toggle()"
      (keydown.escape)="hide()"
    >
      {{ term().code }}
    </button>
    @if (shown()) {
      <span
        class="term-tip"
        [class.term-tip-right]="alignRight()"
        role="tooltip"
        aria-hidden="true"
      >
        <b>{{ term().label }}</b> : {{ term().definition }}
      </span>
    }
  `,
})
export class CriterionTermComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Le critère ou la valeur calculée à expliquer. */
  readonly term = input.required<Pick<CriterionDefinition, 'code' | 'label' | 'definition'>>();

  protected readonly shown = signal(false);
  protected readonly alignRight = signal(false);
  protected readonly ariaLabel = computed(() => {
    const { code, label, definition } = this.term();
    return MESSAGES.term.aria(code, label, definition);
  });

  protected show(): void {
    const view = this.host.nativeElement.ownerDocument.defaultView;
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.alignRight.set(!!view && rect.left > view.innerWidth / 2);
    this.shown.set(true);
  }

  protected hide(): void {
    this.shown.set(false);
  }

  protected toggle(): void {
    if (this.shown()) this.hide();
    else this.show();
  }
}
