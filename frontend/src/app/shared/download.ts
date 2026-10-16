import { DOCUMENT, InjectionToken, inject } from '@angular/core';

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
      // Le navigateur a lu l'adresse au clic ; on la libère ensuite.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    };
  },
});
