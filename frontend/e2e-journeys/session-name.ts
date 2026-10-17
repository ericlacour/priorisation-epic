/**
 * Un nom de session propre à un parcours : le nom est unique parmi toutes les sessions (FR-001a), et les parcours des
 * trois navigateurs partagent la même base. Le suffixe, en minuscules et chiffres, reste lisible dans les noms de
 * fichier exportés (`<nom>-<suffixe>-tableau-v1.csv`).
 */
export function uniqueName(base: string): string {
  return `${base} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Le nom donné par `uniqueName(base)`, pour vérifier un titre ou un nom de session. */
export function namePattern(base: string): RegExp {
  return new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} [a-z0-9]+$`);
}
