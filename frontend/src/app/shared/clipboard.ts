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

/**
 * Copie un fragment HTML dans le presse-papiers (`ClipboardItem`), avec sa version texte, pour un collage mis en forme
 * dans Confluence. Le contenu est une promesse : l'élément est créé pendant le clic, ce que Safari exige, puis rempli
 * à l'arrivée de la réponse. Rejette si le navigateur ne sait pas copier du HTML ou refuse.
 */
export const CLIPBOARD_HTML = new InjectionToken<(html: Promise<string>) => Promise<void>>(
  'CLIPBOARD_HTML',
  {
    providedIn: 'root',
    factory: () => (html) => {
      const clipboard = globalThis.navigator?.clipboard;
      const Item = globalThis.ClipboardItem;
      if (!clipboard?.write || !Item) return Promise.reject(new Error('clipboard unavailable'));
      return clipboard.write([
        new Item({
          'text/html': html.then((text) => new Blob([text], { type: 'text/html' })),
          'text/plain': html.then((text) => new Blob([plainText(text)], { type: 'text/plain' })),
        }),
      ]);
    },
  },
);

/** La version texte d'un export HTML : une ligne par titre, paragraphe ou ligne de tableau, cellules séparées par des tabulations. */
export function plainText(html: string): string {
  // Un saut de ligne dans une cellule devient une espace : une ligne de tableau reste une ligne de texte.
  const body = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, ' '), 'text/html').body;
  const lines: string[] = [];
  for (const element of Array.from(body.querySelectorAll('h1, h2, h3, p, tr'))) {
    lines.push(
      element.tagName === 'TR'
        ? Array.from(element.children)
            .map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())
            .join('\t')
        : (element.textContent ?? '').trim(),
    );
  }
  return lines.join('\n');
}
