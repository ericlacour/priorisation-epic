import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { MESSAGES } from '../i18n/messages.fr';

/**
 * Aperçu de l'assistant IA de priorisation, à droite du tableau : une maquette qui montre l'échange visé (questions
 * sur le classement, appuyées sur la session, Jira et la documentation des fonctionnalités). Rien n'est envoyé : le
 * dialogue est un exemple écrit, la saisie et les suggestions sont désactivées. Masqué par défaut, il s'affiche par
 * « ✦ Assistant IA » dans la barre de session et se masque par la même bascule ou par sa croix. Pendant le classement
 * (FR-015c), l'animateur et les participants ont le même aperçu, avec un échange centré sur le critère en cours.
 */
@Component({
  selector: 'app-assistant-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'assistant-panel', role: 'complementary', '[attr.aria-label]': 'messages.label' },
  template: `
    <div class="assistant-head">
      <h2 class="assistant-title">
        <span class="assistant-mark" aria-hidden="true">✦</span> {{ messages.title }}
        <span class="badge assistant-preview">{{ messages.preview }}</span>
        <button
          type="button"
          class="btn btn-ghost btn-icon assistant-close"
          [attr.aria-label]="messages.close"
          [attr.title]="messages.close"
          (click)="closed.emit()"
        >
          ✕
        </button>
      </h2>
      <p class="assistant-lead">{{ content().lead }}</p>
      <ul class="assistant-sources">
        @for (source of content().sources; track source) {
          <li>{{ source }}</li>
        }
      </ul>
    </div>

    <ol class="assistant-dialogue" tabindex="0" [attr.aria-label]="messages.dialogueLabel">
      @for (message of content().dialogue; track $index) {
        <li class="assistant-message" [attr.data-from]="message.from">
          <span class="assistant-author">{{
            message.from === 'user' ? messages.you : messages.assistant
          }}</span>
          <p>{{ message.text }}</p>
          @if ('items' in message) {
            <ul>
              @for (item of message.items; track item) {
                <li>{{ item }}</li>
              }
            </ul>
            <p>{{ message.after }}</p>
          }
        </li>
      }
    </ol>

    <div class="assistant-compose">
      <div class="assistant-suggestions" role="group" [attr.aria-label]="messages.suggestionsLabel">
        @for (suggestion of content().suggestions; track suggestion) {
          <button type="button" class="btn btn-secondary btn-sm" disabled>{{ suggestion }}</button>
        }
      </div>
      <div class="assistant-input">
        <label class="sr-only" for="assistant-question">{{ messages.inputLabel }}</label>
        <textarea
          id="assistant-question"
          class="input"
          rows="2"
          disabled
          [attr.placeholder]="content().placeholder"
        ></textarea>
        <button type="button" class="btn btn-primary btn-sm" disabled>{{ messages.send }}</button>
      </div>
      <p class="assistant-notice">{{ messages.notice }}</p>
    </div>
  `,
})
export class AssistantPanelComponent {
  protected readonly messages = MESSAGES.assistant;

  /** Où l'aperçu s'affiche : à côté du tableau, ou du classement chez l'animateur ou chez un participant. */
  readonly context = input<'board' | 'animator' | 'participant'>('board');

  /** L'échange d'exemple, ses sources et ses suggestions, selon l'écran. */
  protected readonly content = computed(() => {
    const context = this.context();
    return context === 'board' ? this.messages : this.messages.ranking[context];
  });

  /** La croix masque l'aperçu. */
  readonly closed = output<void>();
}
