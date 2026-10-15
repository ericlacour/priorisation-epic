import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
  input,
  output,
} from '@angular/core';

import { MESSAGES } from '../i18n/messages.fr';

/**
 * Fenêtre modale centrée (import, échelle) : se ferme par la croix, la touche Échap ou un clic à côté. Le focus
 * entre dans la fenêtre à l'ouverture et revient à l'élément qui l'avait à la fermeture. Occupe tout l'écran sur
 * téléphone (feuille de style globale).
 */
@Component({
  selector: 'app-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <button
      type="button"
      class="modal-backdrop"
      tabindex="-1"
      aria-hidden="true"
      data-testid="modal-backdrop"
      (click)="closed.emit()"
    ></button>
    <section
      class="modal"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="labelledBy()"
      tabindex="-1"
    >
      <button
        type="button"
        class="panel-close"
        [attr.aria-label]="messages.close"
        (click)="closed.emit()"
      >
        <span aria-hidden="true">✕</span>
      </button>
      <ng-content />
    </section>
  `,
})
export class ModalComponent implements OnInit, OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private opener: HTMLElement | null = null;

  /** Identifiant du titre de la fenêtre (`aria-labelledby`). */
  readonly labelledBy = input.required<string>();
  readonly closed = output<void>();
  protected readonly messages = MESSAGES.detail;

  ngOnInit(): void {
    this.opener = this.document.activeElement as HTMLElement | null;
    queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>('.modal')?.focus());
  }

  ngOnDestroy(): void {
    this.opener?.focus?.();
  }
}
