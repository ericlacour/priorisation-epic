import { SessionState, parseSessionState } from './session-state';

/**
 * Types du contrat (`contract/`) écrits à la main, et lecture stricte des réponses : aucun champ hors contrat ne
 * circule. Ce fichier décrit la création, l'entrée dans une session et les messages du WebSocket ; l'état de session
 * est dans `session-state.ts`. Les messages des tours de vote arrivent avec leur parcours.
 */

/** `CreateSessionRequest` (openapi.yaml). */
export interface CreateSessionRequest {
  readonly name: string;
  readonly pseudo: string;
  /** Clé d'une méthode de `GET /api/methods` ; absente : WSJF. */
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

/** Une valeur que le changement d'échelle demandé mettrait hors échelle (`SCALE_IMPACT`). */
export interface ImpactedValue {
  readonly externalId: string;
  readonly criterion: string;
  readonly value: number;
}

export interface ErrorMessage {
  readonly type: 'error';
  readonly code: ErrorCode;
  /** La fonctionnalité concernée (`STALE_VERSION`). */
  readonly featureId?: string;
  /** Les valeurs impactées (`SCALE_IMPACT`). */
  readonly impactedValues?: readonly ImpactedValue[];
}

/** Valeurs saisies par clé de critère ; `null` efface la valeur. */
export type CriteriaChanges = Readonly<Record<string, number | null>>;

/** `addFeature` (animateur). */
export interface AddFeatureMessage {
  readonly type: 'addFeature';
  readonly externalId: string;
  readonly title: string;
  readonly description?: string | null;
  readonly criteria?: CriteriaChanges;
}

/** `updateFeature` (animateur) : seuls les champs présents changent ; `version` est celle lue. */
export interface UpdateFeatureMessage {
  readonly type: 'updateFeature';
  readonly featureId: string;
  readonly version: number;
  readonly externalId?: string;
  readonly title?: string;
  readonly description?: string | null;
  readonly criteria?: CriteriaChanges;
  readonly markedForReview?: boolean;
  readonly reviewReason?: string | null;
}

/** `deleteFeature` (animateur). */
export interface DeleteFeatureMessage {
  readonly type: 'deleteFeature';
  readonly featureId: string;
  readonly version: number;
}

/** Type d'échelle (`scale.json`). */
export type ScaleType = 'CONTINUOUS' | 'FIBONACCI';

/**
 * `updateSettings` (animateur) : renommer la session ou changer son échelle. Sans `confirm`, un changement qui met
 * des valeurs hors échelle est refusé par `error SCALE_IMPACT` avec `impactedValues`.
 */
export interface UpdateSettingsMessage {
  readonly type: 'updateSettings';
  readonly name?: string;
  readonly scale?: { readonly type: ScaleType; readonly max: number };
  readonly confirm?: boolean;
}

/** Une ligne valide de l'aperçu d'import (`import-preview.json`). */
export interface ImportRow {
  readonly line: number;
  readonly externalId: string;
  readonly title: string;
  readonly description: string | null;
  readonly criteria: Readonly<Record<string, number | null>>;
}

/** `import-preview.json` : rien n'est écrit avant la confirmation. */
export interface ImportPreview {
  readonly previewId: string;
  readonly sourceType: 'XLSX' | 'CSV' | 'JSON';
  readonly expiresAt: string;
  readonly validRows: readonly ImportRow[];
  readonly rejectedRows: readonly {
    readonly line: number;
    readonly externalId: string | null;
    readonly reason: string;
  }[];
  readonly warnings: readonly { readonly line: number; readonly message: string }[];
  readonly ignoredColumns: readonly string[];
  /** L'échelle d'un export JSON qui sera appliquée à la session vide. */
  readonly scale?: { readonly type: ScaleType; readonly max: number };
}

/** `import-result.json` : le bilan de la confirmation (FR-008). */
export interface ImportResult {
  readonly imported: number;
  readonly rejected: number;
}

/** Messages du serveur reconnus ; un type inconnu est conservé brut. */
export type ServerMessage = TickMessage | ErrorMessage | SessionState | { readonly type: string };

/** Codes de fermeture du serveur (asyncapi.yaml, `x-close-codes`). */
export const CLOSE_UNKNOWN_TOKEN = 4401;
export const CLOSE_SESSION_NOT_FOUND = 4404;
export const CLOSE_POLICY_VIOLATION = 1008;

const SESSION_ID = /^[A-Za-z0-9_-]{22}$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const isInt = (value: unknown): value is number => Number.isInteger(value);

const isImpactedValue = (value: unknown): value is ImpactedValue =>
  isObject(value) &&
  isText(value['externalId']) &&
  isText(value['criterion']) &&
  isInt(value['value']);

const isScaleType = (value: unknown): value is ScaleType =>
  value === 'CONTINUOUS' || value === 'FIBONACCI';

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

/** Lit un message du serveur : `null` s'il n'est pas un objet JSON avec un `type` textuel, ou s'il est hors contrat. */
export function parseServerMessage(json: unknown): ServerMessage | null {
  if (!isObject(json) || typeof json['type'] !== 'string') return null;
  if (json['type'] === 'error') {
    const code = json['code'];
    if (!ERROR_CODES.includes(code as ErrorCode)) return null;
    const featureId = json['featureId'];
    const impacted = json['impactedValues'];
    return {
      type: 'error',
      code: code as ErrorCode,
      ...(typeof featureId === 'string' ? { featureId } : {}),
      ...(Array.isArray(impacted) && impacted.every(isImpactedValue)
        ? { impactedValues: impacted }
        : {}),
    };
  }
  if (json['type'] === 'sessionState') return parseSessionState(json);
  return { type: json['type'] };
}

export function isSessionState(message: ServerMessage): message is SessionState {
  return message.type === 'sessionState';
}

export function isErrorMessage(message: ServerMessage): message is ErrorMessage {
  return message.type === 'error';
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

function isImportRow(value: unknown): value is ImportRow {
  return (
    isObject(value) &&
    isInt(value['line']) &&
    isText(value['externalId']) &&
    isText(value['title']) &&
    (value['description'] === null || typeof value['description'] === 'string') &&
    isObject(value['criteria']) &&
    Object.values(value['criteria']).every((v) => v === null || isInt(v))
  );
}

const isRejectedRow = (value: unknown): boolean =>
  isObject(value) &&
  isInt(value['line']) &&
  (value['externalId'] === null || typeof value['externalId'] === 'string') &&
  typeof value['reason'] === 'string';

const isWarning = (value: unknown): boolean =>
  isObject(value) && isInt(value['line']) && typeof value['message'] === 'string';

/** Lit un aperçu d'import, ou lève une erreur s'il ne respecte pas le contrat. */
export function parseImportPreview(json: unknown): ImportPreview {
  const scale = isObject(json) ? json['scale'] : undefined;
  if (
    !isObject(json) ||
    !isText(json['previewId']) ||
    !['XLSX', 'CSV', 'JSON'].includes(json['sourceType'] as string) ||
    !isText(json['expiresAt']) ||
    !Array.isArray(json['validRows']) ||
    !json['validRows'].every(isImportRow) ||
    !Array.isArray(json['rejectedRows']) ||
    !json['rejectedRows'].every(isRejectedRow) ||
    !Array.isArray(json['warnings']) ||
    !json['warnings'].every(isWarning) ||
    !Array.isArray(json['ignoredColumns']) ||
    !json['ignoredColumns'].every((c) => typeof c === 'string') ||
    (scale !== undefined &&
      (!isObject(scale) || !isScaleType(scale['type']) || !isInt(scale['max'])))
  ) {
    throw new Error('import-preview: unexpected shape');
  }
  return json as unknown as ImportPreview;
}

/** Lit le bilan d'un import, ou lève une erreur s'il ne respecte pas le contrat. */
export function parseImportResult(json: unknown): ImportResult {
  if (!isObject(json) || !isInt(json['imported']) || !isInt(json['rejected'])) {
    throw new Error('import-result: unexpected shape');
  }
  return { imported: json['imported'], rejected: json['rejected'] };
}
