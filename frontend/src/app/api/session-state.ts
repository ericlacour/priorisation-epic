/**
 * `sessionState` (contract/schemas/session-state.json) : types écrits à la main et lecture stricte.
 * Aucun critère d'une méthode n'est nommé ici (FR-017a, FR-017b) : les valeurs sont rangées par clé, et
 * la liste des critères et des valeurs calculées vient de `methodDefinition`.
 */

/** Affichage d'une valeur calculée : entier, ou deux décimales (virgule). */
export type Display = 'INTEGER' | 'DECIMAL_2';

/** Un critère saisi de la méthode (`method-definition.json`). */
export interface CriterionDefinition {
  readonly key: string;
  readonly code: string;
  readonly label: string;
  readonly definition: string;
  readonly header: string;
}

/** Une valeur calculée de la méthode. */
export interface ComputedValueDefinition extends CriterionDefinition {
  readonly display: Display;
}

/** `method-definition.json` : la seule source des colonnes, champs de saisie, sigles et aides. */
export interface MethodDefinition {
  readonly key: string;
  readonly version: number;
  readonly name: string;
  readonly criteria: readonly CriterionDefinition[];
  readonly computedValues: readonly ComputedValueDefinition[];
  readonly formula: string;
  readonly tieBreakRule: string;
}

/** `exact-value.json` : fraction exacte et texte affiché. */
export interface ExactValue {
  readonly numerator: number;
  readonly denominator: number;
  readonly display: string;
}

/** `score.json` : calculé par le serveur, jamais saisi. */
export interface Score {
  readonly complete: boolean;
  readonly outOfScale: readonly string[];
  readonly computed: Readonly<Record<string, ExactValue>> | null;
  readonly explanation: string | null;
  readonly rank: number | null;
}

/** Valeurs retenues par clé de critère (`criteria.json`) ; une clé absente ou `null` n'est pas renseignée. */
export type CriteriaValues = Readonly<Record<string, number | null>>;

/** `feature.json`. `criteria` et `score` sont `null` pendant un tour de vote ouvert, pour un participant. */
export interface Feature {
  readonly id: string;
  readonly externalId: string;
  readonly title: string;
  readonly description: string | null;
  readonly version: number;
  readonly markedForReview: boolean;
  readonly reviewReason: string | null;
  readonly votingInProgress: boolean;
  readonly criteria: CriteriaValues | null;
  readonly score: Score | null;
}

export type Role = 'FACILITATOR' | 'PARTICIPANT';
export type SessionStatus = 'PREPARATION' | 'IN_PROGRESS' | 'CLOSED';

export interface SessionScale {
  readonly type: string;
  readonly max: number;
  readonly allowedValues: readonly number[];
}

export interface Me {
  readonly participantId: string;
  readonly pseudo: string;
  readonly role: Role;
}

export interface Participant {
  readonly participantId: string;
  readonly pseudo: string;
  readonly role: Role;
  readonly businessRole: string | null;
  readonly online: boolean;
}

/** `session-state.json`. `me` est `null` dans la vue de consultation sans jeton. */
export interface SessionState {
  readonly type: 'sessionState';
  readonly version: number;
  readonly sessionId: string;
  readonly name: string;
  readonly status: SessionStatus;
  readonly method: string;
  readonly methodVersion: number;
  readonly methodDefinition: MethodDefinition;
  readonly formula: string;
  readonly tieBreakRule: string;
  readonly scale: SessionScale;
  readonly me: Me | null;
  readonly participants: readonly Participant[];
  readonly features: readonly Feature[];
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const isNullableText = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';
const isInt = (value: unknown): value is number => Number.isInteger(value);
const isArrayOf = <T>(value: unknown, guard: (item: unknown) => item is T): value is T[] =>
  Array.isArray(value) && value.every(guard);

const STATUSES: readonly string[] = ['PREPARATION', 'IN_PROGRESS', 'CLOSED'];
const ROLES: readonly string[] = ['FACILITATOR', 'PARTICIPANT'];

function isCriterionDefinition(value: unknown): value is CriterionDefinition {
  return (
    isObject(value) &&
    isText(value['key']) &&
    isText(value['code']) &&
    isText(value['label']) &&
    isText(value['definition']) &&
    isText(value['header'])
  );
}

function isComputedDefinition(value: unknown): value is ComputedValueDefinition {
  return (
    isCriterionDefinition(value) &&
    ((value as unknown as Json)['display'] === 'INTEGER' ||
      (value as unknown as Json)['display'] === 'DECIMAL_2')
  );
}

/** Lit une définition de méthode, ou `null` si elle ne respecte pas le contrat. */
export function parseMethodDefinition(json: unknown): MethodDefinition | null {
  if (
    !isObject(json) ||
    !isText(json['key']) ||
    !isInt(json['version']) ||
    !isText(json['name']) ||
    !isArrayOf(json['criteria'], isCriterionDefinition) ||
    json['criteria'].length === 0 ||
    !isArrayOf(json['computedValues'], isComputedDefinition) ||
    !isText(json['formula']) ||
    !isText(json['tieBreakRule'])
  ) {
    return null;
  }
  return {
    key: json['key'],
    version: json['version'],
    name: json['name'],
    criteria: json['criteria'].map(({ key, code, label, definition, header }) => ({
      key,
      code,
      label,
      definition,
      header,
    })),
    computedValues: json['computedValues'].map(
      ({ key, code, label, definition, header, display }) => ({
        key,
        code,
        label,
        definition,
        header,
        display,
      }),
    ),
    formula: json['formula'],
    tieBreakRule: json['tieBreakRule'],
  };
}

/** Lit `GET /api/methods` : au moins une méthode, ou `null`. */
export function parseMethodList(json: unknown): MethodDefinition[] | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const methods = json.map(parseMethodDefinition);
  return methods.every((method) => method !== null) ? methods : null;
}

function parseCriteria(value: unknown): CriteriaValues | null | undefined {
  if (value === null) return null;
  if (!isObject(value)) return undefined;
  const values: Record<string, number | null> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== null && !isInt(entry)) return undefined;
    values[key] = entry;
  }
  return values;
}

function parseExactValue(value: unknown): ExactValue | null {
  if (
    !isObject(value) ||
    !isInt(value['numerator']) ||
    !isInt(value['denominator']) ||
    !isText(value['display'])
  ) {
    return null;
  }
  return {
    numerator: value['numerator'],
    denominator: value['denominator'],
    display: value['display'],
  };
}

function parseScore(value: unknown): Score | null | undefined {
  if (value === null) return null;
  if (
    !isObject(value) ||
    typeof value['complete'] !== 'boolean' ||
    !isArrayOf(value['outOfScale'], isText) ||
    !isNullableText(value['explanation'])
  ) {
    return undefined;
  }
  const rank = value['rank'];
  if (rank !== null && !isInt(rank)) return undefined;
  let computed: Record<string, ExactValue> | null = null;
  if (value['computed'] !== null) {
    if (!isObject(value['computed'])) return undefined;
    computed = {};
    for (const [key, entry] of Object.entries(value['computed'])) {
      const exact = parseExactValue(entry);
      if (!exact) return undefined;
      computed[key] = exact;
    }
  }
  return {
    complete: value['complete'],
    outOfScale: value['outOfScale'],
    computed,
    explanation: value['explanation'],
    rank,
  };
}

function parseFeature(value: unknown): Feature | null {
  if (
    !isObject(value) ||
    !isText(value['id']) ||
    !isText(value['externalId']) ||
    !isText(value['title']) ||
    !isNullableText(value['description']) ||
    !isInt(value['version']) ||
    typeof value['markedForReview'] !== 'boolean' ||
    !isNullableText(value['reviewReason']) ||
    typeof value['votingInProgress'] !== 'boolean'
  ) {
    return null;
  }
  const criteria = parseCriteria(value['criteria']);
  const score = parseScore(value['score']);
  if (criteria === undefined || score === undefined) return null;
  return {
    id: value['id'],
    externalId: value['externalId'],
    title: value['title'],
    description: value['description'],
    version: value['version'],
    markedForReview: value['markedForReview'],
    reviewReason: value['reviewReason'],
    votingInProgress: value['votingInProgress'],
    criteria,
    score,
  };
}

function parseParticipant(value: unknown): Participant | null {
  if (
    !isObject(value) ||
    !isText(value['participantId']) ||
    !isText(value['pseudo']) ||
    !ROLES.includes(value['role'] as string) ||
    !isNullableText(value['businessRole']) ||
    typeof value['online'] !== 'boolean'
  ) {
    return null;
  }
  return {
    participantId: value['participantId'],
    pseudo: value['pseudo'],
    role: value['role'] as Role,
    businessRole: value['businessRole'],
    online: value['online'],
  };
}

function parseScale(value: unknown): SessionScale | null {
  if (
    !isObject(value) ||
    !isText(value['type']) ||
    !isInt(value['max']) ||
    !isArrayOf(value['allowedValues'], isInt)
  ) {
    return null;
  }
  return { type: value['type'], max: value['max'], allowedValues: value['allowedValues'] };
}

function parseMe(value: unknown): Me | null | undefined {
  if (value === null) return null;
  if (
    !isObject(value) ||
    !isText(value['participantId']) ||
    !isText(value['pseudo']) ||
    !ROLES.includes(value['role'] as string)
  ) {
    return undefined;
  }
  return {
    participantId: value['participantId'],
    pseudo: value['pseudo'],
    role: value['role'] as Role,
  };
}

/** Lit un `sessionState`, ou `null` s'il ne respecte pas le contrat. */
export function parseSessionState(json: unknown): SessionState | null {
  if (
    !isObject(json) ||
    json['type'] !== 'sessionState' ||
    !isInt(json['version']) ||
    !isText(json['sessionId']) ||
    !isText(json['name']) ||
    !STATUSES.includes(json['status'] as string) ||
    !isText(json['method']) ||
    !isInt(json['methodVersion']) ||
    !isText(json['formula']) ||
    !isText(json['tieBreakRule']) ||
    !Array.isArray(json['participants']) ||
    !Array.isArray(json['features'])
  ) {
    return null;
  }
  const methodDefinition = parseMethodDefinition(json['methodDefinition']);
  const scale = parseScale(json['scale']);
  const me = parseMe(json['me']);
  const participants = json['participants'].map(parseParticipant);
  const features = json['features'].map(parseFeature);
  if (
    !methodDefinition ||
    !scale ||
    me === undefined ||
    participants.some((p) => p === null) ||
    features.some((f) => f === null)
  ) {
    return null;
  }
  return {
    type: 'sessionState',
    version: json['version'],
    sessionId: json['sessionId'],
    name: json['name'],
    status: json['status'] as SessionStatus,
    method: json['method'],
    methodVersion: json['methodVersion'],
    methodDefinition,
    formula: json['formula'],
    tieBreakRule: json['tieBreakRule'],
    scale,
    me,
    participants: participants as Participant[],
    features: features as Feature[],
  };
}
