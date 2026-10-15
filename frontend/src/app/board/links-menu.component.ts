import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

import { MESSAGES } from '../i18n/messages.fr';
import { AnimationLinkComponent } from '../session/animation-link.component';
import { CopyButtonComponent } from '../shared/copy-button.component';

/**
 * Liens de l'animateur, à la demande, en haut à droite du tableau : un bouton « Liens » qui ouvre le lien d'invitation
 * à copier et, sur ordinateur, son lien d'animation privé (FR-002). Les liens sont copiés sans être affichés. Un seul
 * bouton laisse la place aux actions « Importer » et « Échelle » dans un en-tête d'une ligne à 1280 px (FR-014a).
 * Comme la liste des participants : à l'ouverture, le focus va dans la liste ; Échap la ferme et rend le focus au
 * bouton ; Tab hors de la liste ou un clic ailleurs la ferment.
 */
@Component({
  selector: 'app-links-menu',
  imports: [AnimationLinkComponent, CopyButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'links-menu',
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'onEscape()',
    '(focusout)': 'onFocusOut($event)',
  },
  template: `
    <button
      #trigger
      type="button"
      class="btn btn-secondary btn-sm"
      [attr.aria-controls]="open() ? 'links-list' : null"
      [attr.aria-expanded]="open()"
      [attr.title]="messages.hint"
      (click)="toggle()"
    >
      {{ messages.label }} <span aria-hidden="true">{{ open() ? '▴' : '▾' }}</span>
    </button>
    @if (open()) {
      <div
        #list
        id="links-list"
        class="links-pop"
        role="region"
        tabindex="-1"
        [attr.aria-label]="messages.label"
      >
        <app-copy-button
          [label]="messages.invite"
          [hint]="messages.inviteHint"
          [text]="inviteUrl()"
        />
        @if (withAnimation()) {
          <app-animation-link [sessionId]="sessionId()" />
        }
      </div>
    }
  `,
})
export class LinksMenuComponent {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  protected readonly messages = MESSAGES.board.links;

  readonly sessionId = input.required<string>();
  /** Le lien d'invitation à copier. */
  readonly inviteUrl = input.required<string>();
  /** Faux sur téléphone : le lien d'animation n'y est pas proposé. */
  readonly withAnimation = input(true);
  protected readonly open = signal(false);

  protected toggle(): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.open.set(true);
    afterNextRender(() => this.list()?.nativeElement.focus(), { injector: this.injector });
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.contains(event.target as Node)) this.open.set(false);
  }

  protected onEscape(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.trigger()?.nativeElement.focus();
  }

  /** Le focus quitte la liste (Tab) : elle se ferme. */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (this.open() && next instanceof Node && !this.host.contains(next)) this.open.set(false);
  }
}
