import { InjectionToken } from '@angular/core';

/** Copie un texte dans le presse-papiers ; remplaçable dans les tests. Rejette si le navigateur refuse. */
export const CLIPBOARD = new InjectionToken<(text: string) => Promise<void>>('CLIPBOARD', {
  providedIn: 'root',
  factory: () => (text) => {
    const clipboard = globalThis.navigator?.clipboard;
    return clipboard
      ? clipboard.writeText(text)
      : Promise.reject(new Error('clipboard unavailable'));
  },
});
