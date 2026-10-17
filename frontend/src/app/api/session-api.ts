import { Injectable, InjectionToken, inject } from '@angular/core';

import { APP_CONFIG } from '../config/app-config';
import {
  CreateSessionRequest,
  CreateSessionResponse,
  ImportPreview,
  ImportResult,
  JoinSessionRequest,
  JoinSessionResponse,
  SessionSummary,
  isSessionId,
  parseCreateSessionResponse,
  parseImportPreview,
  parseImportResult,
  parseJoinSessionResponse,
  parseProblem,
  parseSessionSummaries,
} from './contract';
import {
  MethodDefinition,
  SessionState,
  parseMethodList,
  parseSessionState,
} from './session-state';

/** `fetch` du navigateur, remplaçable dans les tests. */
export const FETCH = new InjectionToken<typeof fetch>('FETCH', {
  providedIn: 'root',
  factory: () => (input, init) => fetch(input, init),
});

/** Durée maximale d'un appel avant de le considérer comme un échec réseau. */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * - `invalid` : 400, `detail` porte le message français du serveur ;
 * - `pseudoTaken` : 409 ;
 * - `notFound` : 404 ;
 * - `tooManyRequests` : 429 ;
 * - `forbidden` : 403 (import : droits d'animateur absents, ou session clôturée) ;
 * - `tooLarge` : 413 (import : fichier trop gros) ;
 * - `network` : échec réseau, délai dépassé, 5xx, 413 hors import, ou toute réponse inattendue.
 */
export type SessionApiErrorKind =
  'invalid' | 'pseudoTaken' | 'notFound' | 'tooManyRequests' | 'forbidden' | 'tooLarge' | 'network';

export class SessionApiError extends Error {
  constructor(
    readonly kind: SessionApiErrorKind,
    readonly detail: string | null = null,
  ) {
    super(kind);
    this.name = 'SessionApiError';
  }
}

const KINDS: Readonly<Record<number, SessionApiErrorKind>> = {
  400: 'invalid',
  404: 'notFound',
  409: 'pseudoTaken',
  429: 'tooManyRequests',
};

/** Les statuts propres à l'import. */
const IMPORT_KINDS: Readonly<Record<number, SessionApiErrorKind>> = {
  ...KINDS,
  403: 'forbidden',
  413: 'tooLarge',
};

/** Les formats d'export (`GET /api/sessions/{sessionId}/exports/{format}`, FR-023, FR-024). */
export type ExportFormat = 'csv' | 'confluence-wiki' | 'confluence-html' | 'json';

/** L'extension de chaque format, pour le nom de repli d'un fichier exporté. */
const EXPORT_EXTENSIONS: Readonly<Record<ExportFormat, string>> = {
  csv: 'csv',
  'confluence-wiki': 'txt',
  'confluence-html': 'html',
  json: 'json',
};

/** Un fichier exporté, avec le nom versionné donné par le serveur. */
export interface ExportedFile {
  readonly blob: Blob;
  readonly fileName: string;
}

/** Les jetons d'un animateur, envoyés en en-têtes : jamais dans l'adresse. */
export interface FacilitatorTokens {
  readonly participantToken: string;
  readonly animationToken: string;
}

/** Appels REST des sessions (contrat : openapi.yaml). */
@Injectable({ providedIn: 'root' })
export class SessionApi {
  private readonly baseUrl = inject(APP_CONFIG).apiBaseUrl;
  private readonly fetchFn = inject(FETCH);

  /** `GET /api/methods` : les méthodes proposées à la création, chacune dans sa dernière version. */
  async listMethods(): Promise<MethodDefinition[]> {
    const response = await this.send('/api/methods', 'GET');
    if (response.status !== 200) throw await errorOf(response);
    let methods: MethodDefinition[] | null = null;
    try {
      methods = parseMethodList(await response.json());
    } catch {
      // Corps illisible : traité comme une réponse inattendue.
    }
    if (!methods) throw new SessionApiError('network');
    return methods;
  }

  /** `POST /api/sessions` */
  async createSession(request: CreateSessionRequest): Promise<CreateSessionResponse> {
    const response = await this.send('/api/sessions', 'POST', request);
    if (response.status === 201) return parseOrNetwork(response, parseCreateSessionResponse);
    throw await errorOf(response);
  }

  /** `GET /api/sessions` : toutes les sessions, de la plus récente à la plus ancienne (FR-026). */
  async listSessions(): Promise<SessionSummary[]> {
    const response = await this.send('/api/sessions', 'GET');
    if (response.status === 200) return parseOrNetwork(response, parseSessionSummaries);
    throw await errorOf(response);
  }

  /**
   * `GET /api/sessions/{sessionId}` : la vue en lecture seule de la session si elle existe (`null` si son corps est
   * illisible), sinon `notFound` ou `network`.
   */
  async checkSession(sessionId: string): Promise<SessionState | null> {
    assertWellFormedId(sessionId);
    const response = await this.send(sessionPath(sessionId), 'GET');
    if (response.status !== 200) throw await errorOf(response);
    try {
      return parseSessionState(await response.json());
    } catch {
      return null;
    }
  }

  /** `POST /api/sessions/{sessionId}/participants` */
  async joinSession(sessionId: string, request: JoinSessionRequest): Promise<JoinSessionResponse> {
    assertWellFormedId(sessionId);
    const response = await this.send(`${sessionPath(sessionId)}/participants`, 'POST', request);
    if (response.status === 201) return parseOrNetwork(response, parseJoinSessionResponse);
    throw await errorOf(response);
  }

  /**
   * `POST /api/sessions/{sessionId}/imports` : lit le fichier et renvoie l'aperçu ; rien n'est écrit (FR-008).
   * Un fichier refusé en entier donne `invalid`, avec le message du serveur.
   */
  async previewImport(
    sessionId: string,
    file: Blob,
    fileName: string,
    tokens: FacilitatorTokens,
  ): Promise<ImportPreview> {
    assertWellFormedId(sessionId);
    const form = new FormData();
    form.append('file', file, fileName);
    const response = await this.request(`${sessionPath(sessionId)}/imports`, {
      method: 'POST',
      headers: tokenHeaders(tokens),
      body: form,
    });
    if (response.status === 200) return parseOrNetwork(response, parseImportPreview);
    throw await errorOf(response, IMPORT_KINDS);
  }

  /** `POST /api/sessions/{sessionId}/imports/{previewId}/confirm` : `notFound` si l'aperçu a expiré. */
  async confirmImport(
    sessionId: string,
    previewId: string,
    tokens: FacilitatorTokens,
  ): Promise<ImportResult> {
    assertWellFormedId(sessionId);
    const response = await this.request(
      `${sessionPath(sessionId)}/imports/${encodeURIComponent(previewId)}/confirm`,
      { method: 'POST', headers: tokenHeaders(tokens) },
    );
    if (response.status === 200) return parseOrNetwork(response, parseImportResult);
    throw await errorOf(response, IMPORT_KINDS);
  }

  /**
   * `GET /api/sessions/{sessionId}/exports/{format}` : le fichier exporté, ouvert à tout membre et sans jeton. Le nom
   * vient de `Content-Disposition`, à défaut `export.<extension>`.
   */
  async exportFile(sessionId: string, format: ExportFormat): Promise<ExportedFile> {
    assertWellFormedId(sessionId);
    const response = await this.send(
      `${sessionPath(sessionId)}/exports/${encodeURIComponent(format)}`,
      'GET',
    );
    if (response.status !== 200) throw await errorOf(response);
    try {
      return {
        blob: await response.blob(),
        fileName:
          fileNameOf(response.headers.get('Content-Disposition')) ??
          `export.${EXPORT_EXTENSIONS[format]}`,
      };
    } catch {
      throw new SessionApiError('network');
    }
  }

  /** L'adresse du modèle Excel d'une méthode (`GET /api/import-template.xlsx`), à télécharger par un lien. */
  templateUrl(method: string, methodVersion: number): string {
    const query = new URLSearchParams({ method, methodVersion: String(methodVersion) });
    return `${this.baseUrl}/api/import-template.xlsx?${query.toString()}`;
  }

  private async send(path: string, method: 'GET' | 'POST', body?: unknown): Promise<Response> {
    return this.request(path, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await this.fetchFn(`${this.baseUrl}${path}`, {
        ...init,
        cache: 'no-store',
        signal: timeout.signal,
      });
    } catch {
      throw new SessionApiError('network');
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Un identifiant d'une autre forme est une session inconnue : on ne l'envoie pas au serveur. */
function assertWellFormedId(sessionId: string): void {
  if (!isSessionId(sessionId)) throw new SessionApiError('notFound');
}

const sessionPath = (sessionId: string) => `/api/sessions/${encodeURIComponent(sessionId)}`;

const tokenHeaders = (tokens: FacilitatorTokens): Record<string, string> => ({
  'X-Participant-Token': tokens.participantToken,
  'X-Animation-Token': tokens.animationToken,
});

/** Le nom de fichier d'un `Content-Disposition` (`filename*=UTF-8''…` d'abord, puis `filename="…"`). */
export function fileNameOf(disposition: string | null): string | null {
  if (!disposition) return null;
  const extended = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition);
  if (extended) {
    try {
      return decodeURIComponent(extended[1].trim());
    } catch {
      // Encodage invalide : on essaie le nom simple.
    }
  }
  const plain = /filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i.exec(disposition);
  const name = (plain?.[1] ?? plain?.[2])?.trim();
  return name ? name : null;
}

async function parseOrNetwork<T>(response: Response, parse: (json: unknown) => T): Promise<T> {
  try {
    return parse(await response.json());
  } catch {
    throw new SessionApiError('network');
  }
}

/** L'erreur typée d'une réponse inattendue, d'après son statut ; `detail` vient du `problem+json` s'il est lisible. */
async function errorOf(
  response: Response,
  kinds: Readonly<Record<number, SessionApiErrorKind>> = KINDS,
): Promise<SessionApiError> {
  const kind = kinds[response.status];
  if (!kind) return new SessionApiError('network');
  let detail: string | null = null;
  try {
    detail = parseProblem(await response.json())?.detail ?? null;
  } catch {
    // Corps absent ou illisible : pas de détail.
  }
  return new SessionApiError(kind, detail);
}
