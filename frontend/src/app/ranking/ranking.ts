import { SessionScale } from '../api/session-state';
import { parseCriterionInput } from '../board/feature-editor.component';

/**
 * Classement d'un critère (FR-015a) : logique pure, sans Angular, réutilisable pour la saisie d'un participant
 * pendant un tour de vote.
 *
 * Un classement est une liste de niveaux, du plus fort au plus faible ; un niveau regroupe les fonctionnalités mises à
 * égalité. Les fonctionnalités sans valeur au départ attendent, **non classées**, que l'animateur les place.
 *
 * Au départ, chaque fonctionnalité garde sa valeur actuelle : un classement ouvert puis terminé sans rien toucher ne
 * change rien. Une valeur n'est **proposée** qu'à une fonctionnalité déplacée (la valeur de son niveau d'arrivée, ou
 * la valeur juste inférieure à celle du niveau au-dessus), ou à toutes quand l'animateur saisit la valeur du premier
 * niveau : chaque niveau reçoit alors la valeur juste inférieure de l'échelle. Sous la plus petite valeur de
 * l'échelle, plus de proposition : la fonctionnalité reste sans valeur.
 */

/** Niveaux du plus fort au plus faible ; chaque niveau contient des identifiants de fonctionnalité. */
export type Levels = readonly (readonly string[])[];

/** Où déposer une fonctionnalité : dans un niveau existant (égalité), ou dans un nouveau niveau à cette position. */
export type Drop = { readonly into: number } | { readonly before: number };

/** Le classement d'un critère en cours. Les valeurs saisies (premier niveau, valeurs à la main) sont des textes. */
export interface RankingStep {
  readonly levels: Levels;
  /** Sans valeur et pas encore placées, dans l'ordre reçu. */
  readonly unranked: readonly string[];
  /** Déplacées par l'animateur : elles prennent la valeur proposée de leur niveau. */
  readonly moved: readonly string[];
  /** Valeurs au début du classement. */
  readonly initial: Readonly<Record<string, number | null>>;
  readonly top: string;
  /** L'animateur a saisi la valeur du premier niveau : tous les niveaux prennent les valeurs proposées. */
  readonly topTouched: boolean;
  readonly overrides: Readonly<Record<string, string>>;
}

/**
 * Classement de départ : les fonctionnalités qui ont une valeur, groupées par valeur décroissante ; les autres non
 * classées. La valeur du premier niveau est la plus haute valeur actuelle, ou le maximum de l'échelle.
 */
export function newStep(
  ids: readonly string[],
  valueOf: (id: string) => number | null | undefined,
  scale: SessionScale,
): RankingStep {
  const byValue = new Map<number, string[]>();
  const unranked: string[] = [];
  const initial: Record<string, number | null> = {};
  for (const id of ids) {
    const value = valueOf(id) ?? null;
    initial[id] = value;
    if (value === null) unranked.push(id);
    else byValue.set(value, [...(byValue.get(value) ?? []), id]);
  }
  const values = [...byValue.keys()].sort((a, b) => b - a);
  return {
    levels: values.map((value) => byValue.get(value) ?? []),
    unranked,
    moved: [],
    initial,
    top: String(values[0] ?? scale.max),
    topTouched: false,
    overrides: {},
  };
}

/** Retire du classement les fonctionnalités qui ne sont plus choisies, et ajoute les nouvelles à leur place. */
export function reselect(
  step: RankingStep,
  ids: readonly string[],
  valueOf: (id: string) => number | null | undefined,
): RankingStep {
  const kept = new Set(ids);
  const keep = (id: string) => kept.has(id);
  let next: RankingStep = {
    ...step,
    levels: step.levels.map((level) => level.filter(keep)).filter((level) => level.length > 0),
    unranked: step.unranked.filter(keep),
    moved: step.moved.filter(keep),
    initial: Object.fromEntries(Object.entries(step.initial).filter(([id]) => keep(id))),
    overrides: Object.fromEntries(Object.entries(step.overrides).filter(([id]) => keep(id))),
  };
  for (const id of ids) {
    if (id in next.initial) continue;
    const value = valueOf(id) ?? null;
    next = { ...next, initial: { ...next.initial, [id]: value } };
    if (value === null) {
      next = { ...next, unranked: [...next.unranked, id] };
      continue;
    }
    const anchors = next.levels.map((level) => anchorOf(next, level));
    const same = anchors.indexOf(value);
    const below = anchors.findIndex((anchor) => anchor !== null && anchor < value);
    const levels =
      same !== -1
        ? next.levels.map((level, index) => (index === same ? [...level, id] : level))
        : insertLevel(next.levels, below === -1 ? next.levels.length : below, [id]);
    next = { ...next, levels };
  }
  return next;
}

function insertLevel(levels: Levels, index: number, level: readonly string[]): Levels {
  return [...levels.slice(0, index), level, ...levels.slice(index)];
}

/** La valeur de départ qu'un niveau garde : celle de ses fonctionnalités non déplacées, ou `null`. */
function anchorOf(step: RankingStep, level: readonly string[]): number | null {
  for (const id of level) {
    const value = step.initial[id];
    if (!step.moved.includes(id) && value !== null && value !== undefined) return value;
  }
  return null;
}

/** La valeur de l'échelle juste inférieure, ou `null`. */
function below(value: number | null, allowedValues: readonly number[]): number | null {
  if (value === null) return null;
  const lower = allowedValues.filter((allowed) => allowed < value);
  return lower.length > 0 ? Math.max(...lower) : null;
}

/** La valeur de chaque niveau, ou `null` si la valeur du premier niveau n'est pas valide. */
export function levelValues(step: RankingStep, scale: SessionScale): (number | null)[] | null {
  const top = parseCriterionInput(step.top, scale);
  if (top === null || top === undefined) return null;
  if (step.topTouched) return proposedValues(step.levels.length, top, scale.allowedValues);
  const values: (number | null)[] = [];
  for (const [index, level] of step.levels.entries()) {
    const anchor = anchorOf(step, level);
    values.push(
      anchor ?? (index === 0 ? top : below(values[index - 1] ?? null, scale.allowedValues)),
    );
  }
  return values;
}

/**
 * Les valeurs retenues de chaque fonctionnalité, ou `null` si une saisie n'est pas valide (valeur du premier niveau,
 * ou valeur modifiée hors échelle). Une fonctionnalité non classée reste sans valeur, sauf saisie à la main.
 */
export function resolveStep(
  step: RankingStep,
  scale: SessionScale,
): ReadonlyMap<string, number | null> | null {
  const levels = levelValues(step, scale);
  if (!levels) return null;
  const values = new Map<string, number | null>();
  const set = (id: string, proposal: number | null): boolean => {
    if (!(id in step.overrides)) {
      values.set(id, proposal);
      return true;
    }
    const value = parseCriterionInput(step.overrides[id] ?? '', scale);
    values.set(id, value ?? null);
    return value !== undefined;
  };
  for (const [index, level] of step.levels.entries()) {
    for (const id of level) if (!set(id, levels[index] ?? null)) return null;
  }
  for (const id of step.unranked) if (!set(id, null)) return null;
  return values;
}

// --- Déplacements -----------------------------------------------------------------------------------

/** Le niveau de la fonctionnalité, ou -1 (non classée ou inconnue). */
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

/** Ce que chaque bouton d'une fonctionnalité classée peut faire. */
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
 * Place une fonctionnalité : nouveau classement, elle sort des non classées et devient « déplacée » (elle prend la
 * valeur proposée de son niveau). Sans effet si le classement ne change pas.
 */
export function place(step: RankingStep, id: string, levels: Levels): RankingStep {
  if (levels === step.levels) return step;
  return {
    ...step,
    levels,
    unranked: step.unranked.filter((other) => other !== id),
    moved: step.moved.includes(id) ? step.moved : [...step.moved, id],
  };
}

/** Le classement où une fonctionnalité non classée occupe provisoirement un dernier niveau, pour la déplacer. */
export function withPending(step: RankingStep, id: string): Levels {
  return step.unranked.includes(id) ? [...step.levels, [id]] : step.levels;
}

/** Remet une fonctionnalité avec les non classées : elle redevient sans valeur, sauf saisie à la main. */
export function unrank(step: RankingStep, id: string): RankingStep {
  if (step.unranked.includes(id)) return step;
  return {
    ...step,
    levels: step.levels
      .map((level) => level.filter((other) => other !== id))
      .filter((level) => level.length > 0),
    unranked: [...step.unranked, id],
    moved: step.moved.filter((other) => other !== id),
  };
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
