import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';

import { MESSAGES } from '../i18n/messages.fr';

/** Une action de préparation de la session. */
export type PrepareAction = 'import' | 'scale';

/**
 * Menu « Préparer » de l'animateur, dans l'en-tête du tableau : « Importer des fonctionnalités » (FR-007) et
 * « Échelle des valeurs » (FR-010). Un seul bouton garde l'en-tête sur une ligne à 1280 px (FR-014a). Clavier comme
 * le menu du thème : flèches haut / bas, Début / Fin, Entrée ou Espace pour choisir, Échap ou Tab pour fermer ; à la
 * fermeture par Échap, le focus revient au bouton.
 */
@Component({
  selector: 'app-prepare-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'prepare-menu',
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    <button
      #trigger
      type="button"
      class="btn btn-secondary"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="open() ? 'prepare-menu-list' : null"
      [attr.title]="messages.hint"
      [disabled]="disabled()"
      (click)="toggle()"
    >
      {{ messages.label }} <span aria-hidden="true">{{ open() ? '▴' : '▾' }}</span>
    </button>
    @if (open()) {
      <div
        id="prepare-menu-list"
        class="menu-list"
        role="menu"
        tabindex="-1"
        [attr.aria-label]="messages.label"
        (keydown)="onMenuKeydown($event)"
      >
        @for (option of options; track option.action) {
          <button
            #item
            type="button"
            class="menu-item"
            role="menuitem"
            tabindex="-1"
            (click)="choose(option.action)"
          >
            {{ option.label }}
          </button>
        }
      </div>
    }
  `,
})
export class PrepareMenuComponent {
  readonly disabled = input(false);
  readonly chosen = output<PrepareAction>();

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly items = viewChildren<ElementRef<HTMLButtonElement>>('item');

  protected readonly messages = MESSAGES.board.prepare;
  protected readonly options: readonly { action: PrepareAction; label: string }[] = [
    { action: 'import', label: MESSAGES.board.prepare.import },
    { action: 'scale', label: MESSAGES.board.prepare.scale },
  ];
  protected readonly open = signal(false);

  protected toggle(): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.open.set(true);
    afterNextRender(() => this.focusItem(0), { injector: this.injector });
  }

  protected choose(action: PrepareAction): void {
    this.open.set(false);
    this.chosen.emit(action);
  }

  protected onMenuKeydown(event: KeyboardEvent): void {
    const count = this.items().length;
    const index = this.items().findIndex((item) => item.nativeElement === event.target);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.focusItem((index + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.focusItem((index - 1 + count) % count);
        break;
      case 'Home':
        event.preventDefault();
        this.focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        this.focusItem(count - 1);
        break;
      case 'Escape':
        event.preventDefault();
        this.open.set(false);
        this.trigger()?.nativeElement.focus();
        break;
      case 'Tab':
        this.open.set(false);
        break;
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.contains(event.target as Node)) this.open.set(false);
  }

  private focusItem(index: number): void {
    this.items()[index]?.nativeElement.focus();
  }
}
