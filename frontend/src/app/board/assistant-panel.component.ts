import { ChangeDetectionStrategy, Component, output } from '@angular/core';

import { MESSAGES } from '../i18n/messages.fr';

/**
 * Aperçu de l'assistant IA de priorisation, à droite du tableau : une maquette qui montre l'échange visé (questions
 * sur le classement, appuyées sur la session, Jira et la documentation des fonctionnalités). Rien n'est envoyé : le
 * dialogue est un exemple écrit, la saisie et les suggestions sont désactivées. Masqué par défaut, il s'affiche par
 * « ✦ Assistant IA » dans la barre de session et se masque par la même bascule ou par sa croix.
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
      <p class="assistant-lead">{{ messages.lead }}</p>
      <ul class="assistant-sources">
        @for (source of messages.sources; track source) {
          <li>{{ source }}</li>
        }
      </ul>
    </div>

    <ol class="assistant-dialogue" tabindex="0" [attr.aria-label]="messages.dialogueLabel">
      @for (message of messages.dialogue; track $index) {
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
        @for (suggestion of messages.suggestions; track suggestion) {
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
          [attr.placeholder]="messages.placeholder"
        ></textarea>
        <button type="button" class="btn btn-primary btn-sm" disabled>{{ messages.send }}</button>
      </div>
      <p class="assistant-notice">{{ messages.notice }}</p>
    </div>
  `,
})
export class AssistantPanelComponent {
  protected readonly messages = MESSAGES.assistant;

  /** La croix masque l'aperçu. */
  readonly closed = output<void>();
}
