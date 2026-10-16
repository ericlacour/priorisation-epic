import { DOCUMENT, InjectionToken, inject } from '@angular/core';

/**
 * Délai avant de libérer l'adresse temporaire du fichier. Firefox et Safari lisent le fichier après le clic, de façon
 * asynchrone : une libération immédiate peut annuler le téléchargement ou donner un fichier vide.
 */
export const REVOKE_DELAY_MS = 60_000;

/** Enregistre un fichier chez l'utilisateur (lien de téléchargement temporaire) ; remplaçable dans les tests. */
export const SAVE_FILE = new InjectionToken<(blob: Blob, fileName: string) => void>('SAVE_FILE', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return (blob, fileName) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
    };
  },
});
