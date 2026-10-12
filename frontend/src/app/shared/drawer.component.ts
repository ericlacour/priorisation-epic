import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
  input,
  output,
} from '@angular/core';

import { MESSAGES } from '../i18n/messages.fr';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Panneau latéral modal (écrans 4 ter et 4 quater des maquettes) : se ferme par la croix, la touche Échap ou un clic
 * à côté, sur téléphone il occupe tout l'écran. Le focus entre dans le panneau à l'ouverture, y reste tant qu'il est
 * ouvert (Tab boucle) et revient à l'élément précédent à la fermeture. Le contenu (en-tête, corps, pied) est projeté.
 */
@Component({
  selector: 'app-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKeydown($event)', '[class.suspended]': 'suspended()' },
  template: `
    <div class="drawer-backdrop" (click)="closed.emit()" aria-hidden="true"></div>
    <aside
      class="drawer"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      [attr.aria-labelledby]="labelledBy()"
    >
      <div class="drawer-head">
        <div class="drawer-title"><ng-content select="[drawer-head]" /></div>
        <button
          type="button"
          class="btn btn-secondary btn-sm drawer-close"
          [attr.aria-label]="messages.close"
          (click)="closed.emit()"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <!-- Atteignable au clavier : sans élément interactif à l'intérieur, une zone qui défile ne pourrait pas être lue. -->
      <div class="drawer-body" role="region" tabindex="0" [attr.aria-labelledby]="labelledBy()">
        <ng-content />
      </div>
      <div class="drawer-foot"><ng-content select="[drawer-foot]" /></div>
    </aside>
  `,
})
export class DrawerComponent implements OnInit, OnDestroy {
  protected readonly messages = MESSAGES.detail;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private previous: HTMLElement | null = null;

  /** `id` du titre du panneau (`aria-labelledby`). */
  readonly labelledBy = input.required<string>();
  readonly closed = output<void>();
  /** Masqué et sourd au clavier tant qu'un autre panneau est ouvert par-dessus (la saisie est conservée). */
  readonly suspended = input(false);

  ngOnInit(): void {
    this.previous = this.document.activeElement as HTMLElement | null;
    queueMicrotask(() =>
      this.host.nativeElement.querySelector<HTMLElement>('.drawer-close')?.focus(),
    );
  }

  ngOnDestroy(): void {
    this.previous?.focus?.();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.suspended()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closed.emit();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = this.document.activeElement;
    if (event.shiftKey && (active === first || !this.host.nativeElement.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !this.host.nativeElement.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }
}
