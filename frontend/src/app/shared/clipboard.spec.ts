import { describe, expect, it } from 'vitest';

import { plainText } from './clipboard';

describe('plainText', () => {
  it('keeps one line per heading, paragraph and table row, cells separated by tabs', () => {
    const html =
      '<h2>Priorisation Fonctionnalités : Atelier (16/10/2026)</h2>\n<p>Méthode WSJF v1.</p>\n' +
      '<table><thead><tr><th>Rang</th><th>Titre</th></tr></thead>' +
      '<tbody><tr><td>1</td><td>Deux<br>lignes &amp; plus</td></tr></tbody></table>';

    expect(plainText(html)).toBe(
      'Priorisation Fonctionnalités : Atelier (16/10/2026)\nMéthode WSJF v1.\nRang\tTitre\n1\tDeux lignes & plus',
    );
  });
});
