import type { Page, WebSocketRoute } from '@playwright/test';

import { FACILITATOR, PARTICIPANT, SESSION_ID, WSJF } from '../src/app/testing/fixtures';

/**
 * Faux serveur de session pour l'e2e (comme `fake-session-socket` de planning-poker) : il répond au `hello`, applique
 * `addFeature`, `updateFeature` et `deleteFeature` et rediffuse un `sessionState`. Il calcule le CoD et le WSJF à la
 * place du vrai serveur, uniquement pour que le tableau ait des valeurs à afficher : le front, lui, ne recalcule rien.
 * Chaque intention reçue est gardée dans `intents`, pour vérifier « une seule intention par enregistrement ».
 */
export const ANIMATION_TOKEN = 'anim-token';
export const PARTICIPANT_TOKEN = 'participant-token';

type Values = Record<string, number | null>;

export interface FakeFeature {
  id: string;
  externalId: string;
  title: string;
  description: string | null;
  version: number;
  markedForReview: boolean;
  reviewReason: string | null;
  criteria: Values;
}

type Json = Record<string, unknown>;

const KEYS = ['bv', 'tc', 'rrOe', 'js'] as const;
const format = (value: number) => value.toFixed(2).replace('.', ',');

/** Une fonctionnalité pour les tests : `criteria` partiel, les autres critères restent non saisis. */
export function feature(
  externalId: string,
  title: string,
  criteria: Partial<Values> = {},
  extra: Partial<FakeFeature> = {},
): FakeFeature {
  return {
    id: `feature-${externalId.toLowerCase()}`,
    externalId,
    title,
    description: null,
    version: 0,
    markedForReview: false,
    reviewReason: null,
    criteria: { bv: null, tc: null, rrOe: null, js: null, ...criteria },
    ...extra,
  };
}

export class FakeSession {
  readonly intents: Json[] = [];
  /** Tours servis tels quels (le faux serveur n'en calcule aucun) : les intentions de tour sont seulement notées. */
  status = 'IN_PROGRESS';
  openRounds: Json[] = [];
  lastRevealedRounds: Json[] = [];
  /** Fonctionnalités en vote : masquées (critères et score nuls) pour un participant, visibles de l'animateur. */
  voting = new Set<string>();
  private readonly sockets = new Map<WebSocketRoute, boolean>();
  private version = 1;

  constructor(
    public features: FakeFeature[],
    private readonly scaleMax = 10,
  ) {}

  /** Branche le faux serveur sur la page : santé du service et canal WebSocket de la session. */
  async install(page: Page, options: { facilitator: boolean }): Promise<void> {
    await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'UP' } }));
    await page.addInitScript(
      ([id, token, animation]) => {
        localStorage.setItem(`pe.token.${id}`, token);
        if (animation) localStorage.setItem(`pe.animation.${id}`, animation);
      },
      [SESSION_ID, PARTICIPANT_TOKEN, options.facilitator ? ANIMATION_TOKEN : ''] as const,
    );
    await page.routeWebSocket(`**/ws/sessions/${SESSION_ID}`, (ws) => {
      ws.onMessage((raw) => this.receive(ws, JSON.parse(String(raw)) as Json));
      ws.onClose(() => this.sockets.delete(ws));
    });
  }

  /** Une modification venue d'un autre poste : l'état est rediffusé à tous les navigateurs connectés. */
  change(update: (features: FakeFeature[]) => void): void {
    update(this.features);
    this.broadcast();
  }

  private receive(ws: WebSocketRoute, message: Json): void {
    switch (message['type']) {
      case 'hello':
        this.sockets.set(ws, message['animationToken'] === ANIMATION_TOKEN);
        this.send(ws);
        break;
      case 'addFeature':
        this.intents.push(message);
        this.add(ws, message);
        break;
      case 'updateFeature':
        this.intents.push(message);
        this.update(ws, message);
        break;
      case 'deleteFeature':
        this.intents.push(message);
        this.features = this.features.filter((f) => f.id !== message['featureId']);
        this.broadcast();
        break;
      case 'changeStatus':
      case 'openRound':
      case 'castVote':
      case 'revealRound':
      case 'transferFacilitator':
        this.intents.push(message);
        break;
      default:
        break;
    }
  }

  private add(ws: WebSocketRoute, message: Json): void {
    const externalId = String(message['externalId']);
    if (this.features.some((f) => f.externalId.toLowerCase() === externalId.toLowerCase())) {
      ws.send(JSON.stringify({ type: 'error', code: 'DUPLICATE_EXTERNAL_ID' }));
      return;
    }
    this.features.push(
      feature(externalId, String(message['title']), (message['criteria'] as Values) ?? {}),
    );
    this.broadcast();
  }

  private update(ws: WebSocketRoute, message: Json): void {
    const target = this.features.find((f) => f.id === message['featureId']);
    if (!target) return;
    if (target.version !== message['version']) {
      ws.send(
        JSON.stringify({ type: 'error', code: 'STALE_VERSION', featureId: message['featureId'] }),
      );
      return;
    }
    if (typeof message['title'] === 'string') target.title = message['title'];
    if ('description' in message) target.description = message['description'] as string | null;
    if (message['criteria']) Object.assign(target.criteria, message['criteria']);
    if (typeof message['markedForReview'] === 'boolean') {
      target.markedForReview = message['markedForReview'];
      target.reviewReason = (message['reviewReason'] as string | undefined) ?? null;
    }
    target.version++;
    this.broadcast();
  }

  private broadcast(): void {
    this.version++;
    for (const ws of this.sockets.keys()) this.send(ws);
  }

  private send(ws: WebSocketRoute): void {
    const facilitator = this.sockets.get(ws) ?? false;
    ws.send(JSON.stringify(this.state(facilitator)));
  }

  private state(facilitator: boolean): Json {
    const me = facilitator ? FACILITATOR : PARTICIPANT;
    return {
      type: 'sessionState',
      version: this.version,
      sessionId: SESSION_ID,
      name: 'PI 27 – Epics plateforme',
      status: this.status,
      method: WSJF.key,
      methodVersion: WSJF.version,
      methodDefinition: WSJF,
      formula: WSJF.formula,
      tieBreakRule: WSJF.tieBreakRule,
      scale: {
        type: 'CONTINUOUS',
        max: this.scaleMax,
        allowedValues: Array.from({ length: this.scaleMax }, (_, i) => i + 1),
      },
      me: { participantId: me.participantId, pseudo: me.pseudo, role: me.role },
      participants: [FACILITATOR, PARTICIPANT],
      features: this.arranged(facilitator).map((f) => this.view(f, facilitator)),
      openRounds: this.openRounds,
      lastRevealedRounds: this.lastRevealedRounds,
    };
  }

  /** Complètes d'abord (WSJF, puis CoD décroissants), puis les autres ; à égalité, l'identifiant. */
  private ranked(): FakeFeature[] {
    const byId = (a: FakeFeature, b: FakeFeature) =>
      a.externalId.toLowerCase().localeCompare(b.externalId.toLowerCase());
    const complete = this.features
      .filter((f) => this.score(f).complete)
      .sort(
        (a, b) =>
          this.score(b).wsjf - this.score(a).wsjf ||
          this.score(b).cod - this.score(a).cod ||
          byId(a, b),
      );
    const others = this.features.filter((f) => !this.score(f).complete).sort(byId);
    return [...complete, ...others];
  }

  private score(f: FakeFeature) {
    const c = f.criteria;
    const outOfScale = KEYS.filter((k) => c[k] != null && (c[k]! < 1 || c[k]! > this.scaleMax));
    const complete = KEYS.every((k) => c[k] != null) && outOfScale.length === 0;
    const cod = complete ? c['bv']! + c['tc']! + c['rrOe']! : 0;
    return { complete, outOfScale: [...outOfScale], cod, wsjf: complete ? cod / c['js']! : 0 };
  }

  /** Pour un participant, les fonctionnalités en vote passent en fin de tableau (FR-019a). */
  private arranged(facilitator: boolean): FakeFeature[] {
    const all = this.ranked();
    if (facilitator) return all;
    return [
      ...all.filter((f) => !this.voting.has(f.id)),
      ...all.filter((f) => this.voting.has(f.id)),
    ];
  }

  private view(f: FakeFeature, facilitator: boolean): Json {
    const inVote = this.voting.has(f.id);
    if (inVote && !facilitator) {
      return {
        id: f.id,
        externalId: f.externalId,
        title: f.title,
        description: f.description,
        version: f.version,
        markedForReview: f.markedForReview,
        reviewReason: f.reviewReason,
        votingInProgress: true,
        criteria: null,
        score: null,
      };
    }
    const score = this.score(f);
    const rank = score.complete
      ? this.ranked()
          .filter((x) => this.score(x).complete)
          .indexOf(f) + 1
      : null;
    return {
      id: f.id,
      externalId: f.externalId,
      title: f.title,
      description: f.description,
      version: f.version,
      markedForReview: f.markedForReview,
      reviewReason: f.reviewReason,
      ...(inVote ? { votingInProgress: true } : {}),
      criteria: f.criteria,
      score: {
        complete: score.complete,
        outOfScale: score.outOfScale,
        computed: score.complete
          ? {
              cod: { numerator: score.cod, denominator: 1, display: String(score.cod) },
              wsjf: {
                numerator: score.cod,
                denominator: f.criteria['js'],
                display: format(score.wsjf),
              },
            }
          : null,
        explanation: score.complete
          ? `CoD = ${f.criteria['bv']} + ${f.criteria['tc']} + ${f.criteria['rrOe']} = ${score.cod} ; WSJF = ${score.cod} / ${f.criteria['js']} = ${format(score.wsjf)}`
          : null,
        rank,
      },
    };
  }
}
