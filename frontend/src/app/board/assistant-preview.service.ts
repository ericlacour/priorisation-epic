import { Injectable, inject, signal } from '@angular/core';

import { BrowserStorage } from '../storage/browser-storage';

/**
 * L'aperçu de l'assistant IA (FR-014d) est-il affiché ? Une simple illustration : masqué par défaut, il s'affiche ou se
 * masque d'un clic, et le choix est gardé dans ce navigateur (`pe.assistant`), jamais envoyé au serveur.
 */
@Injectable({ providedIn: 'root' })
export class AssistantPreviewService {
  private readonly storage = inject(BrowserStorage);
  private readonly shownState = signal(this.storage.readAssistantShown());

  readonly shown = this.shownState.asReadonly();

  toggle(): void {
    this.set(!this.shownState());
  }

  hide(): void {
    this.set(false);
  }

  private set(shown: boolean): void {
    this.shownState.set(shown);
    this.storage.saveAssistantShown(shown);
  }
}
