/**
 * Types du contrat (`contract/`) écrits à la main, et lecture stricte des réponses : aucun champ hors contrat ne
 * circule. Sont décrits ici la création, l'entrée dans une session, la liste des méthodes, l'état de session
 * (`sessionState`), les intentions de fonctionnalité et les messages de liaison du WebSocket ; le reste vient avec les
 * parcours. Aucun critère d'une méthode n'est nommé : les critères et les valeurs calculées sont des tables indexées
 * par les clés de `methodDefinition` (FR-017a, FR-017b).
 */

/** `CreateSessionRequest` (openapi.yaml). */
export interface CreateSessionRequest {
  readonly name: string;
  readonly pseudo: string;
  readonly method?: string;
}

/** `CreateSessionResponse`. Les deux jetons sont SECRETS : jamais dans une URL ni un journal. */
export interface CreateSessionResponse {
  readonly sessionId: string;
  readonly participantToken: string;
  readonly animationToken: string;
}

/** `JoinSessionRequest`. */
export interface JoinSessionRequest {
  readonly pseudo: string;
  readonly businessRole?: string;
}

/** `JoinSessionResponse`. `participantToken` est SECRET : jamais dans une URL ni un journal. */
export interface JoinSessionResponse {
  readonly participantToken: string;
}

/** `Problem` (RFC 9457) : `detail` est un message français exploitable. */
export interface Problem {
  readonly title: string;
  readonly status: number;
  readonly detail: string;
}

/** `error.code` du WebSocket (asyncapi.yaml). */
export const ERROR_CODES = [
  'INVALID_MESSAGE',
  'FORBIDDEN',
  'SESSION_CLOSED',
  'STALE_VERSION',
  'INVALID_VALUE',
  'DUPLICATE_EXTERNAL_ID',
  'FEATURE_IN_OPEN_ROUND',
  'ROUND_REVEALED',
  'SCALE_IMPACT',
  'UNKNOWN_PARTICIPANT',
  'SESSION_NOT_STARTED',
  'ROUND_OPEN',
  'PARTICIPANT_OFFLINE',
  'UNKNOWN_CRITERION',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Message client `hello` : premier message, dans les 5 s. L'`animationToken` n'est joint que chez l'animateur. */
export interface HelloMessage {
  readonly type: 'hello';
  readonly participantToken: string;
  readonly animationToken?: string;
}

export interface HeartbeatMessage {
  readonly type: 'heartbeat';
}

export interface TickMessage {
  readonly type: 'tick';
}

export interface ErrorMessage {
  readonly type: 'error';
  readonly code: ErrorCode;
  readonly featureId?: string;
}

/** Valeurs saisies par clé de critère ; `null` ou absente : non saisie. */
export type CriteriaValues = Readonly<Record<string, number | null>>;

export type ScaleType = 'CONTINUOUS' | 'FIBONACCI';

export interface Scale {
  readonly type: ScaleType;
  readonly max: number;
  readonly allowedValues?: readonly number[];
}

/** Un critère saisi (ou, avec `display`, une valeur calculée) de `methodDefinition`. */
export interface CriterionDefinition {
  readonly key: string;
  readonly code: string;
  readonly label: string;
  readonly definition: string;
  readonly header: string;
}

export type DisplayKind = 'INTEGER' | 'DECIMAL_2';

export interface ComputedValueDefinition extends CriterionDefinition {
  readonly display: DisplayKind;
}

/** `method-definition.json` : source unique des critères, valeurs calculées, libellés et aides d'une méthode. */
export interface MethodDefinition {
  readonly key: string;
  readonly version: number;
  readonly name: string;
  readonly criteria: readonly CriterionDefinition[];
  readonly computedValues: readonly ComputedValueDefinition[];
  readonly formula: string;
  readonly tieBreakRule: string;
}

/** Valeur calculée : l'affichage (`display`) est déjà formaté par le serveur et n'est jamais recalculé. */
export interface ExactValue {
  readonly numerator: number;
  readonly denominator: number;
  readonly display: string;
}

export interface Score {
  readonly complete: boolean;
  readonly outOfScale: readonly string[];
  readonly computed: Readonly<Record<string, ExactValue>> | null;
  readonly explanation: string | null;
  readonly rank: number | null;
}

/** `criteria` et `score` valent `null` pendant un tour ouvert, pour un destinataire qui n'est pas l'animateur. */
export interface Feature {
  readonly id: string;
  readonly externalId: string;
  readonly title: string;
  readonly description: string | null;
  readonly version: number;
  readonly markedForReview: boolean;
  readonly reviewReason: string | null;
  readonly votingInProgress?: boolean;
  readonly criteria: CriteriaValues | null;
  readonly score: Score | null;
}

export type SessionStatus = 'PREPARATION' | 'IN_PROGRESS' | 'CLOSED';
export type ParticipantRole = 'FACILITATOR' | 'PARTICIPANT';

export interface Participant {
  readonly participantId: string;
  readonly pseudo: string;
  readonly role: ParticipantRole;
  readonly businessRole?: string | null;
  readonly online: boolean;
}

export interface SessionMe {
  readonly participantId: string;
  readonly pseudo: string;
  readonly role: ParticipantRole;
}

export type RoundStatus = 'OPEN' | 'REVEALED';

/** Nombre de fonctionnalités du tour qu'un participant a notées (au moins un critère renseigné, FR-019). */
export interface RoundProgress {
  readonly participantId: string;
  readonly completedCount: number;
}

/** Un vote révélé : une valeur par clé de critère, `null` ou absente pour « sans avis ». */
export interface RevealedVote {
  readonly participantId: string;
  readonly criteria: CriteriaValues;
}

/** Résultats d'une fonctionnalité d'un tour révélé (FR-020, FR-021), calculés par le serveur. */
export interface FeatureResult {
  readonly featureId: string;
  readonly votes: readonly RevealedVote[];
  readonly nonVoters: readonly string[];
  readonly min: CriteriaValues;
  readonly max: CriteriaValues;
  readonly largeSpread: readonly string[];
  readonly unanimous: CriteriaValues;
}

/**
 * Un tour de vote. Tant qu'il est `OPEN`, `myVotes` ne porte que les votes du destinataire et `results` vaut `null`
 * (FR-019, SC-004) ; révélé, `myVotes` est vide et `results` porte tout.
 */
export interface Round {
  readonly id: string;
  readonly number: number;
  readonly status: RoundStatus;
  readonly previousRoundId: string | null;
  readonly featureIds: readonly string[];
  readonly progress: readonly RoundProgress[];
  readonly myVotes: Readonly<Record<string, CriteriaValues>>;
  readonly results: readonly FeatureResult[] | null;
}

/** `session-state.json`, filtré pour son destinataire. */
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
  readonly scale: Scale;
  readonly me: SessionMe | null;
  readonly participants: readonly Participant[];
  readonly features: readonly Feature[];
  /** Les tours en cours, du plus ancien au plus récent. */
  readonly openRounds: readonly Round[];
  /** Les tours révélés, du plus récent au plus ancien. */
  readonly lastRevealedRounds: readonly Round[];
}

/** Envoyé au seul bénéficiaire d'une transmission du rôle d'animateur (FR-002a) : son nouveau jeton, SECRET. */
export interface FacilitatorHandoverMessage {
  readonly type: 'facilitatorHandover';
  readonly animationToken: string;
}

/** Messages du serveur reconnus : `tick`, `error`, `sessionState`, `facilitatorHandover` ; les autres restent bruts. */
export type ServerMessage =
  | TickMessage
  | ErrorMessage
  | SessionState
  | FacilitatorHandoverMessage
  | { readonly type: string };

export const isHandover = (message: ServerMessage): message is FacilitatorHandoverMessage =>
  message.type === 'facilitatorHandover';

export const isSessionState = (message: ServerMessage): message is SessionState =>
  message.type === 'sessionState';

/** Intentions de l'animateur sur les fonctionnalités (asyncapi.yaml). */
export interface AddFeatureMessage {
  readonly type: 'addFeature';
  readonly externalId: string;
  readonly title: string;
  readonly description?: string | null;
  readonly criteria?: CriteriaValues;
}

export interface UpdateFeatureChanges {
  readonly externalId?: string;
  readonly title?: string;
  readonly description?: string | null;
  readonly criteria?: CriteriaValues;
  readonly markedForReview?: boolean;
  readonly reviewReason?: string | null;
}

export interface UpdateFeatureMessage extends UpdateFeatureChanges {
  readonly type: 'updateFeature';
  readonly featureId: string;
  readonly version: number;
}

export interface DeleteFeatureMessage {
  readonly type: 'deleteFeature';
  readonly featureId: string;
  readonly version: number;
}

/** Intentions de session, de tour et de rôle (asyncapi.yaml). */
export interface ChangeStatusMessage {
  readonly type: 'changeStatus';
  readonly action: 'START';
}

export interface OpenRoundMessage {
  readonly type: 'openRound';
  readonly featureIds: readonly string[];
  readonly previousRoundId?: string;
}

export interface CastVoteMessage {
  readonly type: 'castVote';
  readonly roundId: string;
  readonly featureId: string;
  readonly criteria: CriteriaValues;
}

export interface RevealRoundMessage {
  readonly type: 'revealRound';
  readonly roundId: string;
}

export interface TransferFacilitatorMessage {
  readonly type: 'transferFacilitator';
  readonly participantId: string;
}

/** Codes de fermeture du serveur (asyncapi.yaml, `x-close-codes`). */
export const CLOSE_UNKNOWN_TOKEN = 4401;
export const CLOSE_SESSION_NOT_FOUND = 4404;
export const CLOSE_POLICY_VIOLATION = 1008;

const SESSION_ID = /^[A-Za-z0-9_-]{22}$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** Un identifiant de session est toujours de 128 bits en base64url (22 caractères). */
export const isSessionId = (value: string): boolean => SESSION_ID.test(value);

export function helloMessage(
  participantToken: string,
  animationToken?: string | null,
): HelloMessage {
  return animationToken
    ? { type: 'hello', participantToken, animationToken }
    : { type: 'hello', participantToken };
}

export function heartbeatMessage(): HeartbeatMessage {
  return { type: 'heartbeat' };
}

export function addFeatureMessage(feature: Omit<AddFeatureMessage, 'type'>): AddFeatureMessage {
  return { type: 'addFeature', ...feature };
}

export function updateFeatureMessage(
  featureId: string,
  version: number,
  changes: UpdateFeatureChanges,
): UpdateFeatureMessage {
  return { type: 'updateFeature', featureId, version, ...changes };
}

export function deleteFeatureMessage(featureId: string, version: number): DeleteFeatureMessage {
  return { type: 'deleteFeature', featureId, version };
}

export const startSessionMessage = (): ChangeStatusMessage => ({
  type: 'changeStatus',
  action: 'START',
});

export function openRoundMessage(
  featureIds: readonly string[],
  previousRoundId?: string,
): OpenRoundMessage {
  return previousRoundId
    ? { type: 'openRound', featureIds, previousRoundId }
    : { type: 'openRound', featureIds };
}

export const castVoteMessage = (
  roundId: string,
  featureId: string,
  criteria: CriteriaValues,
): CastVoteMessage => ({ type: 'castVote', roundId, featureId, criteria });

export const revealRoundMessage = (roundId: string): RevealRoundMessage => ({
  type: 'revealRound',
  roundId,
});

export const transferFacilitatorMessage = (participantId: string): TransferFacilitatorMessage => ({
  type: 'transferFacilitator',
  participantId,
});

/** Lit un message du serveur : `null` s'il n'est pas un objet JSON avec un `type` textuel. */
export function parseServerMessage(json: unknown): ServerMessage | null {
  if (!isObject(json) || typeof json['type'] !== 'string') return null;
  if (json['type'] === 'error') {
    const code = json['code'];
    if (!ERROR_CODES.includes(code as ErrorCode)) return null;
    const featureId = json['featureId'];
    return typeof featureId === 'string'
      ? { type: 'error', code: code as ErrorCode, featureId }
      : { type: 'error', code: code as ErrorCode };
  }
  if (json['type'] === 'sessionState') {
    try {
      return parseSessionState(json);
    } catch {
      return null;
    }
  }
  if (json['type'] === 'facilitatorHandover') {
    return isText(json['animationToken'])
      ? { type: 'facilitatorHandover', animationToken: json['animationToken'] }
      : null;
  }
  return { type: json['type'] };
}

/** Lit une réponse de création, ou lève une erreur si elle ne respecte pas le contrat. */
export function parseCreateSessionResponse(json: unknown): CreateSessionResponse {
  if (
    !isObject(json) ||
    !isText(json['sessionId']) ||
    !isText(json['participantToken']) ||
    !isText(json['animationToken'])
  ) {
    throw new Error('create-session-response: unexpected shape');
  }
  return {
    sessionId: json['sessionId'],
    participantToken: json['participantToken'],
    animationToken: json['animationToken'],
  };
}

/** Lit une réponse d'entrée dans une session, ou lève une erreur si elle ne respecte pas le contrat. */
export function parseJoinSessionResponse(json: unknown): JoinSessionResponse {
  if (!isObject(json) || !isText(json['participantToken'])) {
    throw new Error('join-session-response: unexpected shape');
  }
  return { participantToken: json['participantToken'] };
}

/** Lit un `problem+json`, ou renvoie `null` s'il ne respecte pas le contrat. */
export function parseProblem(json: unknown): Problem | null {
  if (
    !isObject(json) ||
    typeof json['title'] !== 'string' ||
    typeof json['status'] !== 'number' ||
    typeof json['detail'] !== 'string'
  ) {
    return null;
  }
  return { title: json['title'], status: json['status'], detail: json['detail'] };
}

// --- Lecture stricte de la liste des méthodes et de l'état de session -------------------------------------------

const fail = (what: string): never => {
  throw new Error(`${what}: unexpected shape`);
};

const isInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);

const asObject = (value: unknown, what: string): Record<string, unknown> =>
  isObject(value) ? value : fail(what);

const asText = (value: unknown, what: string): string => (isText(value) ? value : fail(what));

const asInt = (value: unknown, what: string): number => (isInt(value) ? value : fail(what));

const asBool = (value: unknown, what: string): boolean =>
  typeof value === 'boolean' ? value : fail(what);

const asNullableText = (value: unknown, what: string): string | null =>
  value === null ? null : typeof value === 'string' ? value : fail(what);

const asArray = (value: unknown, what: string): unknown[] =>
  Array.isArray(value) ? value : fail(what);

function parseCriterion(json: unknown): CriterionDefinition {
  const o = asObject(json, 'criterion');
  return {
    key: asText(o['key'], 'criterion.key'),
    code: asText(o['code'], 'criterion.code'),
    label: asText(o['label'], 'criterion.label'),
    definition: asText(o['definition'], 'criterion.definition'),
    header: asText(o['header'], 'criterion.header'),
  };
}

function parseComputedValue(json: unknown): ComputedValueDefinition {
  const o = asObject(json, 'computedValue');
  const display = o['display'];
  if (display !== 'INTEGER' && display !== 'DECIMAL_2') fail('computedValue.display');
  return { ...parseCriterion(json), display: display as DisplayKind };
}

/** Lit une `methodDefinition`, ou lève une erreur si elle ne respecte pas le contrat. */
export function parseMethodDefinition(json: unknown): MethodDefinition {
  const o = asObject(json, 'method-definition');
  const criteria = asArray(o['criteria'], 'method-definition.criteria').map(parseCriterion);
  if (criteria.length === 0) fail('method-definition.criteria');
  return {
    key: asText(o['key'], 'method-definition.key'),
    version: asInt(o['version'], 'method-definition.version'),
    name: asText(o['name'], 'method-definition.name'),
    criteria,
    computedValues: asArray(o['computedValues'], 'method-definition.computedValues').map(
      parseComputedValue,
    ),
    formula: asText(o['formula'], 'method-definition.formula'),
    tieBreakRule: asText(o['tieBreakRule'], 'method-definition.tieBreakRule'),
  };
}

/** Lit la réponse de `GET /api/methods`, ou lève une erreur si elle ne respecte pas le contrat. */
export function parseMethodList(json: unknown): MethodDefinition[] {
  const methods = asArray(json, 'method-list').map(parseMethodDefinition);
  if (methods.length === 0) fail('method-list');
  return methods;
}

function parseScale(json: unknown): Scale {
  const o = asObject(json, 'scale');
  const type = o['type'];
  if (type !== 'CONTINUOUS' && type !== 'FIBONACCI') fail('scale.type');
  const max = asInt(o['max'], 'scale.max');
  const allowed = o['allowedValues'];
  return allowed === undefined
    ? { type: type as ScaleType, max }
    : {
        type: type as ScaleType,
        max,
        allowedValues: asArray(allowed, 'scale.allowedValues').map((v) =>
          asInt(v, 'scale.allowedValues'),
        ),
      };
}

function parseCriteria(json: unknown): CriteriaValues {
  const o = asObject(json, 'criteria');
  const values: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(o)) {
    values[key] = value === null ? null : asInt(value, 'criteria value');
  }
  return values;
}

function parseExactValue(json: unknown): ExactValue {
  const o = asObject(json, 'exact-value');
  return {
    numerator: asInt(o['numerator'], 'exact-value.numerator'),
    denominator: asInt(o['denominator'], 'exact-value.denominator'),
    display: asText(o['display'], 'exact-value.display'),
  };
}

function parseScore(json: unknown): Score {
  const o = asObject(json, 'score');
  const computed = o['computed'];
  const rank = o['rank'];
  return {
    complete: asBool(o['complete'], 'score.complete'),
    outOfScale: asArray(o['outOfScale'], 'score.outOfScale').map((k) =>
      asText(k, 'score.outOfScale'),
    ),
    computed:
      computed === null
        ? null
        : Object.fromEntries(
            Object.entries(asObject(computed, 'score.computed')).map(([k, v]) => [
              k,
              parseExactValue(v),
            ]),
          ),
    explanation: asNullableText(o['explanation'], 'score.explanation'),
    rank: rank === null ? null : asInt(rank, 'score.rank'),
  };
}

function parseFeature(json: unknown): Feature {
  const o = asObject(json, 'feature');
  const criteria = o['criteria'];
  const score = o['score'];
  const base = {
    id: asText(o['id'], 'feature.id'),
    externalId: asText(o['externalId'], 'feature.externalId'),
    title: asText(o['title'], 'feature.title'),
    description: asNullableText(o['description'], 'feature.description'),
    version: asInt(o['version'], 'feature.version'),
    markedForReview: asBool(o['markedForReview'], 'feature.markedForReview'),
    reviewReason: asNullableText(o['reviewReason'], 'feature.reviewReason'),
    criteria: criteria === null ? null : parseCriteria(criteria),
    score: score === null ? null : parseScore(score),
  };
  return o['votingInProgress'] === undefined
    ? base
    : { ...base, votingInProgress: asBool(o['votingInProgress'], 'feature.votingInProgress') };
}

function parseParticipant(json: unknown): Participant {
  const o = asObject(json, 'participant');
  const role = o['role'];
  if (role !== 'FACILITATOR' && role !== 'PARTICIPANT') fail('participant.role');
  const base = {
    participantId: asText(o['participantId'], 'participant.participantId'),
    pseudo: asText(o['pseudo'], 'participant.pseudo'),
    role: role as ParticipantRole,
    online: asBool(o['online'], 'participant.online'),
  };
  return o['businessRole'] === undefined
    ? base
    : { ...base, businessRole: asNullableText(o['businessRole'], 'participant.businessRole') };
}

function parseMe(json: unknown): SessionMe | null {
  if (json === null) return null;
  const o = asObject(json, 'me');
  const role = o['role'];
  if (role !== 'FACILITATOR' && role !== 'PARTICIPANT') fail('me.role');
  return {
    participantId: asText(o['participantId'], 'me.participantId'),
    pseudo: asText(o['pseudo'], 'me.pseudo'),
    role: role as ParticipantRole,
  };
}

/** Les tours sont facultatifs dans le contrat : absents, il n'y en a aucun. */
const parseRounds = (value: unknown, what: string): Round[] =>
  value === undefined ? [] : asArray(value, what).map(parseRound);

const asTextArray = (value: unknown, what: string): string[] =>
  asArray(value, what).map((v) => asText(v, what));

function parseFeatureResult(json: unknown): FeatureResult {
  const o = asObject(json, 'round.result');
  return {
    featureId: asText(o['featureId'], 'round.result.featureId'),
    votes: asArray(o['votes'], 'round.result.votes').map((v) => {
      const vote = asObject(v, 'round.result.vote');
      return {
        participantId: asText(vote['participantId'], 'round.result.vote.participantId'),
        criteria: parseCriteria(vote['criteria']),
      };
    }),
    nonVoters: asTextArray(o['nonVoters'], 'round.result.nonVoters'),
    min: parseCriteria(o['min']),
    max: parseCriteria(o['max']),
    largeSpread: asTextArray(o['largeSpread'], 'round.result.largeSpread'),
    unanimous: parseCriteria(o['unanimous']),
  };
}

function parseRound(json: unknown): Round {
  const o = asObject(json, 'round');
  const status = o['status'];
  if (status !== 'OPEN' && status !== 'REVEALED') fail('round.status');
  const results = o['results'];
  return {
    id: asText(o['id'], 'round.id'),
    number: asInt(o['number'], 'round.number'),
    status: status as RoundStatus,
    previousRoundId: asNullableText(o['previousRoundId'], 'round.previousRoundId'),
    featureIds: asTextArray(o['featureIds'], 'round.featureIds'),
    progress: asArray(o['progress'], 'round.progress').map((p) => {
      const progress = asObject(p, 'round.progress');
      return {
        participantId: asText(progress['participantId'], 'round.progress.participantId'),
        completedCount: asInt(progress['completedCount'], 'round.progress.completedCount'),
      };
    }),
    myVotes: Object.fromEntries(
      Object.entries(asObject(o['myVotes'], 'round.myVotes')).map(([id, v]) => [
        id,
        parseCriteria(v),
      ]),
    ),
    results: results === null ? null : asArray(results, 'round.results').map(parseFeatureResult),
  };
}

/** Lit un `sessionState` (WebSocket ou `GET /api/sessions/{id}`), ou lève une erreur s'il ne respecte pas le contrat. */
export function parseSessionState(json: unknown): SessionState {
  const o = asObject(json, 'session-state');
  if (o['type'] !== 'sessionState') fail('session-state.type');
  const status = o['status'];
  if (status !== 'PREPARATION' && status !== 'IN_PROGRESS' && status !== 'CLOSED') {
    fail('session-state.status');
  }
  return {
    type: 'sessionState',
    version: asInt(o['version'], 'session-state.version'),
    sessionId: asText(o['sessionId'], 'session-state.sessionId'),
    name: asText(o['name'], 'session-state.name'),
    status: status as SessionStatus,
    method: asText(o['method'], 'session-state.method'),
    methodVersion: asInt(o['methodVersion'], 'session-state.methodVersion'),
    methodDefinition: parseMethodDefinition(o['methodDefinition']),
    formula: asText(o['formula'], 'session-state.formula'),
    tieBreakRule: asText(o['tieBreakRule'], 'session-state.tieBreakRule'),
    scale: parseScale(o['scale']),
    me: parseMe(o['me']),
    participants: asArray(o['participants'], 'session-state.participants').map(parseParticipant),
    features: asArray(o['features'], 'session-state.features').map(parseFeature),
    openRounds: parseRounds(o['openRounds'], 'session-state.openRounds'),
    lastRevealedRounds: parseRounds(o['lastRevealedRounds'], 'session-state.lastRevealedRounds'),
  };
}
