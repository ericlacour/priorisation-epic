/** Remplace les `{nom}` d'un texte du catalogue par leur valeur. Un `{nom}` sans valeur reste tel quel. */
export function format(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}
