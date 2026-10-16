import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';

import { ExportFormat, SessionApi, SessionApiError } from '../api/session-api';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';
import { CLIPBOARD_HTML } from '../shared/clipboard';
import { SAVE_FILE } from '../shared/download';

const MESSAGES_EXPORT = MESSAGES.board.exportMenu;

/** Un choix du menu : un fichier à télécharger, ou le tableau à copier pour Confluence. */
interface ExportChoice {
  readonly id: string;
  readonly label: string;
  readonly version: string | null;
  readonly format: ExportFormat;
  readonly copy: boolean;
}

const CHOICES: readonly ExportChoice[] = [
  {
    id: 'csv',
    label: MESSAGES_EXPORT.csv,
    version: MESSAGES_EXPORT.csvVersion,
    format: 'csv',
    copy: false,
  },
  {
    id: 'confluence',
    label: MESSAGES_EXPORT.confluence,
    version: null,
    format: 'confluence-html',
    copy: true,
  },
  {
    id: 'wiki',
    label: MESSAGES_EXPORT.wiki,
    version: null,
    format: 'confluence-wiki',
    copy: false,
  },
  {
    id: 'json',
    label: MESSAGES_EXPORT.json,
    version: MESSAGES_EXPORT.jsonVersion,
    format: 'json',
    copy: false,
  },
];

/** Durée d'affichage d'un message de réussite. */
export const EXPORT_NOTICE_MS = 5_000;

/**
 * Menu « Exporter ▾ » de la barre de session (FR-014c, FR-023, FR-024), le même pour tous les membres : tableau CSV
 * (`tableau-v1`), « Copier pour Confluence » (tableau HTML copié dans le presse-papiers), wiki markup Confluence et
 * session complète JSON. Les fichiers viennent du serveur, dans l'ordre du tableau, avec leur nom versionné. Le CSV des
 * votes s'ajoute avec le vote masqué. Clavier comme le menu du thème : flèches, Début / Fin, Échap ou Tab pour fermer.
 * Le résultat s'annonce sous le bouton (`role="status"`, ou `alert` en cas d'échec).
 */
@Component({
  selector: 'app-export-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'export-menu',
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    <button
      #trigger
      type="button"
      class="btn btn-secondary"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="open() ? 'export-menu-list' : null"
      [attr.title]="messages.hint"
      [attr.aria-busy]="busy()"
      (click)="toggle()"
    >
      {{ messages.label }} <span aria-hidden="true">{{ open() ? '▴' : '▾' }}</span>
    </button>
    @if (open()) {
      <div
        id="export-menu-list"
        class="menu-list export-list"
        role="menu"
        tabindex="-1"
        [attr.aria-label]="messages.label"
        (keydown)="onMenuKeydown($event)"
      >
        @for (choice of choices; track choice.id) {
          <button
            #item
            type="button"
            class="menu-item"
            role="menuitem"
            tabindex="-1"
            [attr.data-export]="choice.id"
            (click)="choose(choice)"
          >
            {{ choice.label }}
            @if (choice.version) {
              <span class="version">{{ choice.version }}</span>
            }
          </button>
        }
      </div>
    }
    @if (notice(); as current) {
      <p
        class="export-notice"
        [class.error]="current.error"
        [attr.role]="current.error ? 'alert' : 'status'"
      >
        <span>{{ current.text }}</span>
        <button
          type="button"
          class="panel-close"
          [attr.aria-label]="messages.close"
          (click)="notice.set(null)"
        >
          ×
        </button>
      </p>
    }
  `,
})
export class ExportMenuComponent {
  private readonly api = inject(SessionApi);
  private readonly saveFile = inject(SAVE_FILE);
  private readonly copyHtml = inject(CLIPBOARD_HTML);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly items = viewChildren<ElementRef<HTMLButtonElement>>('item');
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  readonly sessionId = input.required<string>();

  protected readonly messages = MESSAGES_EXPORT;
  protected readonly choices = CHOICES;
  protected readonly open = signal(false);
  protected readonly busy = signal(false);
  protected readonly notice = signal<{ readonly text: string; readonly error: boolean } | null>(
    null,
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.noticeTimer));
  }

  protected toggle(): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.open.set(true);
    afterNextRender(() => this.focusItem(0), { injector: this.injector });
  }

  protected async choose(choice: ExportChoice): Promise<void> {
    this.close();
    if (this.busy()) return;
    this.busy.set(true);
    try {
      if (choice.copy) {
        await this.copy(choice.format);
      } else {
        const file = await this.api.exportFile(this.sessionId(), choice.format);
        this.saveFile(file.blob, file.fileName);
        this.show(format(this.messages.downloaded, { file: file.fileName }), false);
      }
    } catch (error) {
      this.show(this.failure(error), true);
    } finally {
      this.busy.set(false);
    }
  }

  /** La copie démarre pendant le clic (Safari) ; seul l'échec de l'export ou de la copie est annoncé. */
  private async copy(exportFormat: ExportFormat): Promise<void> {
    const html = this.api
      .exportFile(this.sessionId(), exportFormat)
      .then((file) => file.blob.text());
    // L'échec de l'export est signalé tel quel ; celui de la copie seule propose le wiki markup.
    html.catch(() => undefined);
    try {
      await this.copyHtml(html);
    } catch (error) {
      await html;
      throw error instanceof SessionApiError ? error : new CopyError();
    }
    this.show(this.messages.copied, false);
  }

  private failure(error: unknown): string {
    if (error instanceof CopyError) return this.messages.copyFailed;
    if (error instanceof SessionApiError && error.kind === 'notFound')
      return this.messages.notFound;
    return this.messages.failed;
  }

  private show(text: string, error: boolean): void {
    clearTimeout(this.noticeTimer);
    this.notice.set({ text, error });
    if (!error) this.noticeTimer = setTimeout(() => this.notice.set(null), EXPORT_NOTICE_MS);
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

/** Le navigateur n'a pas pu copier le HTML, alors que l'export a réussi. */
class CopyError extends Error {}
