/**
 * Types du contrat (`specs/001-wsjf-prioritization-session/contracts/`) écrits à la main, et lecture stricte des
 * réponses : aucun champ hors contrat ne circule. Seuls la création, l'entrée dans une session et les messages de
 * liaison du WebSocket (`hello`, `heartbeat`, `tick`, `error`) sont décrits ici ; le reste vient avec les parcours.
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
}

/** Messages du serveur reconnus par la couche de liaison ; les autres (`sessionState`…) restent bruts. */
export type ServerMessage = TickMessage | ErrorMessage | { readonly type: string };

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

/** Lit un message du serveur : `null` s'il n'est pas un objet JSON avec un `type` textuel. */
export function parseServerMessage(json: unknown): ServerMessage | null {
  if (!isObject(json) || typeof json['type'] !== 'string') return null;
  if (json['type'] === 'error') {
    const code = json['code'];
    return ERROR_CODES.includes(code as ErrorCode)
      ? { type: 'error', code: code as ErrorCode }
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
