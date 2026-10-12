import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';

import { MESSAGES } from '../i18n/messages.fr';
import { Theme, ThemeService } from '../theme/theme';

const THEMES: readonly { readonly value: Theme; readonly label: string }[] = [
  { value: 'auto', label: MESSAGES.topBar.themeAuto },
  { value: 'light', label: MESSAGES.topBar.themeLight },
  { value: 'dark', label: MESSAGES.topBar.themeDark },
];

/**
 * Menu du thème, dans la barre du haut : un bouton qui ouvre une liste « Automatique » / « Clair » / « Sombre », le
 * thème actuel coché. Le thème est une préférence locale ({@link ThemeService}), jamais envoyée au serveur. Clavier :
 * flèches haut / bas, Début / Fin, Entrée ou Espace pour choisir, Échap ou Tab pour fermer ; à la fermeture par Échap
 * ou par un choix, le focus revient au bouton.
 */
@Component({
  selector: 'app-theme-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'theme-menu',
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    <button
      #trigger
      type="button"
      class="btn btn-secondary"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="open() ? 'theme-menu-list' : null"
      [attr.aria-label]="messages.themeMenuLabel"
      (click)="toggle()"
    >
      {{ messages.themeMenu }}
      <span class="chev" aria-hidden="true"></span>
    </button>
    @if (open()) {
      <div
        id="theme-menu-list"
        class="menu-list"
        role="menu"
        tabindex="-1"
        [attr.aria-label]="messages.themeMenuLabel"
        (keydown)="onMenuKeydown($event)"
      >
        @for (option of themes; track option.value) {
          <button
            #item
            type="button"
            class="menu-item"
            role="menuitemradio"
            [attr.aria-checked]="theme() === option.value"
            tabindex="-1"
            (click)="choose(option.value)"
          >
            <span class="menu-check" aria-hidden="true">{{
              theme() === option.value ? '✓' : ''
            }}</span>
            {{ option.label }}
          </button>
        }
      </div>
    }
  `,
})
export class ThemeMenuComponent {
  private readonly themeService = inject(ThemeService);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly items = viewChildren<ElementRef<HTMLButtonElement>>('item');

  protected readonly messages = MESSAGES.topBar;
  protected readonly themes = THEMES;
  protected readonly theme = this.themeService.theme;
  protected readonly open = signal(false);

  protected toggle(): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.open.set(true);
    // Le focus va au choix coché, une fois la liste rendue.
    afterNextRender(() => this.focusItem(THEMES.findIndex((o) => o.value === this.theme())), {
      injector: this.injector,
    });
  }

  protected choose(theme: Theme): void {
    if (theme !== this.theme()) this.themeService.choose(theme);
    this.close();
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
        this.close();
        break;
      case 'Tab':
        this.open.set(false);
        break;
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.contains(event.target as Node)) this.open.set(false);
  }

  private close(): void {
    this.open.set(false);
    this.trigger()?.nativeElement.focus();
  }

  private focusItem(index: number): void {
    this.items()[index]?.nativeElement.focus();
  }
}
