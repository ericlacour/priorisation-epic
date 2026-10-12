import { Injectable, InjectionToken, inject } from '@angular/core';

import { APP_CONFIG } from '../config/app-config';
import {
  CreateSessionRequest,
  CreateSessionResponse,
  JoinSessionRequest,
  JoinSessionResponse,
  MethodDefinition,
  SessionState,
  isSessionId,
  parseCreateSessionResponse,
  parseJoinSessionResponse,
  parseMethodList,
  parseProblem,
  parseSessionState,
} from './contract';

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
 * - `network` : échec réseau, délai dépassé, 5xx, 413, ou toute réponse inattendue.
 */
export type SessionApiErrorKind =
  'invalid' | 'pseudoTaken' | 'notFound' | 'tooManyRequests' | 'network';

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

/** Appels REST des sessions (contrat : openapi.yaml). */
@Injectable({ providedIn: 'root' })
export class SessionApi {
  private readonly baseUrl = inject(APP_CONFIG).apiBaseUrl;
  private readonly fetchFn = inject(FETCH);

  /** `POST /api/sessions` */
  async createSession(request: CreateSessionRequest): Promise<CreateSessionResponse> {
    const response = await this.send('/api/sessions', 'POST', request);
    if (response.status === 201) return parseOrNetwork(response, parseCreateSessionResponse);
    throw await errorOf(response);
  }

  /** `GET /api/methods` : les méthodes proposées à la création, chacune dans sa dernière version. */
  async listMethods(): Promise<MethodDefinition[]> {
    const response = await this.send('/api/methods', 'GET');
    if (response.status === 200) return parseOrNetwork(response, parseMethodList);
    throw await errorOf(response);
  }

  /** `GET /api/sessions/{sessionId}` : résout si la session existe, sinon `notFound` ou `network`. */
  async checkSession(sessionId: string): Promise<void> {
    assertWellFormedId(sessionId);
    const response = await this.send(sessionPath(sessionId), 'GET');
    if (response.status === 200) return;
    throw await errorOf(response);
  }

  /** `GET /api/sessions/{sessionId}` : vue d'un participant sans vote, `me` vaut `null`. */
  async getSession(sessionId: string): Promise<SessionState> {
    assertWellFormedId(sessionId);
    const response = await this.send(sessionPath(sessionId), 'GET');
    if (response.status === 200) return parseOrNetwork(response, parseSessionState);
    throw await errorOf(response);
  }

  /** `POST /api/sessions/{sessionId}/participants` */
  async joinSession(sessionId: string, request: JoinSessionRequest): Promise<JoinSessionResponse> {
    assertWellFormedId(sessionId);
    const response = await this.send(`${sessionPath(sessionId)}/participants`, 'POST', request);
    if (response.status === 201) return parseOrNetwork(response, parseJoinSessionResponse);
    throw await errorOf(response);
  }

  private async send(path: string, method: 'GET' | 'POST', body?: unknown): Promise<Response> {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
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

async function parseOrNetwork<T>(response: Response, parse: (json: unknown) => T): Promise<T> {
  try {
    return parse(await response.json());
  } catch {
    throw new SessionApiError('network');
  }
}

/** L'erreur typée d'une réponse inattendue, d'après son statut ; `detail` vient du `problem+json` s'il est lisible. */
async function errorOf(response: Response): Promise<SessionApiError> {
  const kind = KINDS[response.status];
  if (!kind) return new SessionApiError('network');
  let detail: string | null = null;
  try {
    detail = parseProblem(await response.json())?.detail ?? null;
  } catch {
    // Corps absent ou illisible : pas de détail.
  }
  return new SessionApiError(kind, detail);
}
