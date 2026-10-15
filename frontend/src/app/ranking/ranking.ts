/**
 * Classement d'un critère (FR-015a) : logique pure, sans Angular, réutilisable pour la saisie d'un participant
 * pendant un tour de vote.
 *
 * Un classement est une liste de niveaux, du plus fort au plus faible ; un niveau regroupe les fonctionnalités mises à
 * égalité. Chaque niveau reçoit une valeur proposée : la valeur de départ pour le premier niveau, puis la valeur
 * juste inférieure de l'échelle pour chaque niveau suivant. Sous la plus petite valeur de l'échelle, plus de
 * proposition : la fonctionnalité reste sans valeur.
 */

/** Niveaux du plus fort au plus faible ; chaque niveau contient des identifiants de fonctionnalité. */
export type Levels = readonly (readonly string[])[];

/** Où déposer une fonctionnalité : dans un niveau existant (égalité), ou dans un nouveau niveau à cette position. */
export type Drop = { readonly into: number } | { readonly before: number };

/**
 * Classement de départ : les fonctionnalités qui ont déjà une valeur sont groupées par valeur décroissante, puis
 * celles sans valeur, chacune à son niveau, dans l'ordre reçu.
 */
export function initialLevels(
  ids: readonly string[],
  valueOf: (id: string) => number | null | undefined,
): Levels {
  const byValue = new Map<number, string[]>();
  const without: string[][] = [];
  for (const id of ids) {
    const value = valueOf(id);
    if (value === null || value === undefined) {
      without.push([id]);
    } else {
      byValue.set(value, [...(byValue.get(value) ?? []), id]);
    }
  }
  const valued = [...byValue.entries()].sort(([a], [b]) => b - a).map(([, group]) => group);
  return [...valued, ...without];
}

/** Le niveau de la fonctionnalité, ou -1. */
export function levelOf(levels: Levels, id: string): number {
  return levels.findIndex((level) => level.includes(id));
}

/**
 * Déplace la fonctionnalité dans un niveau existant ou dans un nouveau niveau. Les positions sont celles d'avant le
 * déplacement ; un niveau vidé disparaît.
 */
export function moveTo(levels: Levels, id: string, drop: Drop): Levels {
  const from = levelOf(levels, id);
  if (from === -1) return levels;
  if ('into' in drop && drop.into === from) return levels;
  const result: string[][] = levels.map((level) => level.filter((other) => other !== id));
  if ('into' in drop) {
    const target = result[drop.into];
    if (!target) return levels;
    target.push(id);
  } else {
    const before = Math.max(0, Math.min(drop.before, result.length));
    result.splice(before, 0, [id]);
  }
  return result.filter((level) => level.length > 0);
}

/** Monte d'un cran : seule à son niveau, elle passe au-dessus du niveau précédent ; à égalité, elle sort au-dessus. */
export function moveUp(levels: Levels, id: string): Levels {
  const from = levelOf(levels, id);
  if (from === -1) return levels;
  if ((levels[from]?.length ?? 0) > 1) return moveTo(levels, id, { before: from });
  return from === 0 ? levels : moveTo(levels, id, { before: from - 1 });
}

/** Descend d'un cran : seule à son niveau, elle passe sous le niveau suivant ; à égalité, elle sort en dessous. */
export function moveDown(levels: Levels, id: string): Levels {
  const from = levelOf(levels, id);
  if (from === -1) return levels;
  if ((levels[from]?.length ?? 0) > 1) return moveTo(levels, id, { before: from + 1 });
  return from === levels.length - 1 ? levels : moveTo(levels, id, { before: from + 2 });
}

/** Met à égalité avec le niveau au-dessus. */
export function joinAbove(levels: Levels, id: string): Levels {
  const from = levelOf(levels, id);
  return from <= 0 ? levels : moveTo(levels, id, { into: from - 1 });
}

/** Ce que chaque bouton d'une fonctionnalité peut faire. */
export function canMoveUp(levels: Levels, id: string): boolean {
  const from = levelOf(levels, id);
  return from > 0 || (from === 0 && (levels[0]?.length ?? 0) > 1);
}

export function canMoveDown(levels: Levels, id: string): boolean {
  const from = levelOf(levels, id);
  return from !== -1 && (from < levels.length - 1 || (levels[from]?.length ?? 0) > 1);
}

export function canJoinAbove(levels: Levels, id: string): boolean {
  return levelOf(levels, id) > 0;
}

/**
 * Valeurs proposées, une par niveau : `top` pour le premier, puis la valeur juste inférieure de l'échelle à chaque
 * niveau. `null` quand l'échelle est épuisée.
 */
export function proposedValues(
  levelCount: number,
  top: number,
  allowedValues: readonly number[],
): (number | null)[] {
  const descending = [...allowedValues].filter((value) => value <= top).sort((a, b) => b - a);
  return Array.from({ length: levelCount }, (_, index) => descending[index] ?? null);
}
