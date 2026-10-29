#!/usr/bin/env node
// Test de charge du webservice (T115, SC-002 et SC-005) : une session de P participants connectés en
// WebSocket et de F fonctionnalités, sur laquelle l'animateur fait E modifications de valeur.
//
//   node deploy/load-test.mjs --url https://priorisation-epic.onrender.com --origin https://priorisation-epic-app.onrender.com
//
// Options : --url (obligatoire, origine http(s) du webservice), --participants 10 (animateur compris),
// --features 50, --edits 100, --drafts 50, --pause-ms 200 (entre deux envois), --origin (en-tête Origin envoyé à
// l'ouverture du WebSocket, à mettre dans ALLOWED_ORIGINS ; aucun par défaut), --timeout-ms 10000 (au-delà,
// une diffusion compte comme non reçue).
//
// Déroulé :
// 1. l'animateur crée la session par REST, ouvre sa connexion (hello avec son jeton d'animation) et ajoute
//    les F fonctionnalités (addFeature), une à une, avec des valeurs tirées au hasard ;
// 2. les P − 1 autres participants rejoignent la session par REST puis ouvrent leur connexion : l'ouverture
//    est mesurée de l'envoi de `hello` au premier `sessionState` reçu (SC-005 : moins de 3 s) ;
// 3. l'animateur fait E modifications de valeur (updateFeature) ; pour chacune, le script mesure le délai
//    entre l'envoi et la réception, par chaque participant connecté, de l'instantané qui porte la nouvelle
//    version de la fonctionnalité, donc le tableau recalculé et retrié (SC-002 et SC-005 : moins de 2 s) ;
// 3 bis. l'animateur diffuse D brouillons de classement (updateRankingDraft, FR-015b), un ordre différent des F
//    fonctionnalités à chaque fois ; pour chacun, le script mesure le délai jusqu'à la réception, par chaque
//    participant connecté, du `rankingRoom` qui porte ce classement (moins de 2 s), puis ferme la salle
//    (endRanking CANCELLED) ;
// 4. les P connexions se ferment puis se rouvrent toutes en même temps (cas d'un redéploiement) :
//    chaque ouverture est mesurée de la même façon.
//
// Chaque connexion envoie `heartbeat` toutes les 5 s. La session est démarrée (changeStatus START) avant
// l'arrivée des participants et clôturée à la fin (CLOSE).
// Sortie 1 si une diffusion dépasse 2 s ou n'arrive pas, si une ouverture dépasse 3 s, si le webservice
// répond `error` ou si une connexion tombe ; 0 sinon. Utilise le WebSocket natif de Node 24 ; aucune
// dépendance.

const HEARTBEAT_MS = 5_000;
const PROPAGATION_LIMIT_MS = 2_000;
const OPENING_LIMIT_MS = 3_000;
const CRITERIA = ['bv', 'tc', 'rrOe', 'js'];

function parseArgs(argv) {
  const options = {
    url: null,
    participants: 10,
    features: 50,
    edits: 100,
    drafts: 50,
    pauseMs: 200,
    origin: null,
    timeoutMs: 10_000,
  };
  for (let i = 0; i < argv.length; i += 2) {
    const [key, value] = [argv[i], argv[i + 1]];
    if (value === undefined) throw new Error(`valeur manquante pour ${key}`);
    switch (key) {
      case '--url':
        options.url = value.replace(/\/+$/, '');
        break;
      case '--origin':
        options.origin = value;
        break;
      case '--participants':
      case '--features':
      case '--edits':
      case '--drafts':
      case '--pause-ms':
      case '--timeout-ms': {
        const number = Number(value);
        if (!(Number.isInteger(number) && number >= 0)) throw new Error(`${key} doit être un entier positif`);
        const name = key.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase());
        options[name] = number;
        break;
      }
      default:
        throw new Error(`option inconnue : ${key}`);
    }
  }
  if (!options.url || !/^https?:\/\/[^/]+$/.test(options.url)) {
    throw new Error('--url est obligatoire : origine http(s) du webservice, sans chemin');
  }
  if (options.participants < 1) throw new Error('--participants doit valoir au moins 1');
  if (options.features < 1) throw new Error('--features doit valoir au moins 1');
  return options;
}

const now = () => performance.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomValue = () => 1 + Math.floor(Math.random() * 10);

/** Mutations en attente de diffusion : chacune attend un instantané précis chez chaque destinataire. */
class Expectations {
  constructor(timeoutMs) {
    this.timeoutMs = timeoutMs;
    this.pending = new Set();
    this.latencies = [];
    this.missed = [];
  }

  /** Attend que chaque pair de `recipients` reçoive un message de ce type (`sessionState` par défaut) qui satisfait `match`. */
  expect(label, recipients, match, t0, type = 'sessionState') {
    const expectation = { label, waiting: new Set(recipients), match, t0, type };
    if (expectation.waiting.size === 0) return Promise.resolve();
    this.pending.add(expectation);
    return new Promise((resolve) => {
      expectation.resolve = resolve;
      expectation.timer = setTimeout(() => {
        for (const peer of expectation.waiting) this.missed.push(`${label} → ${peer.label}`);
        this.pending.delete(expectation);
        resolve();
      }, this.timeoutMs);
    });
  }

  received(peer, state, at) {
    for (const expectation of this.pending) {
      if (expectation.type !== state.type) continue;
      if (expectation.waiting.has(peer) && expectation.match(state)) {
        expectation.waiting.delete(peer);
        this.latencies.push(at - expectation.t0);
        if (expectation.waiting.size === 0) {
          clearTimeout(expectation.timer);
          this.pending.delete(expectation);
          expectation.resolve();
        }
      }
    }
  }
}

class Peer {
  constructor(run, label, participantToken, animationToken = null) {
    Object.assign(this, { run, label, participantToken, animationToken });
    this.socket = null;
    this.state = null;
  }

  get open() {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  /** Ouvre la connexion et envoie `hello` ; résout au premier instantané avec le délai depuis `hello`. */
  connect() {
    const { options, session, expectations, drops, errors } = this.run;
    const url = `${options.url.replace(/^http/, 'ws')}/ws/sessions/${session.id}`;
    const init = options.origin ? { headers: { Origin: options.origin } } : undefined;
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, init);
      this.socket = socket;
      let first = true;
      let helloAt = 0;
      socket.addEventListener('open', () => {
        const hello = { type: 'hello', participantToken: this.participantToken };
        if (this.animationToken) hello.animationToken = this.animationToken;
        helloAt = now();
        socket.send(JSON.stringify(hello));
      });
      socket.addEventListener('message', (event) => {
        const at = now();
        const message = JSON.parse(event.data);
        if (message.type === 'sessionState') {
          this.state = message;
          expectations.received(this, message, at);
          if (first) {
            first = false;
            resolve(at - helloAt);
          }
        } else if (message.type === 'rankingRoom') {
          expectations.received(this, message, at);
        } else if (message.type === 'error') {
          errors.push(`${this.label} : error ${message.code}`);
        }
      });
      socket.addEventListener('close', (event) => {
        if (first) reject(new Error(`${this.label} : fermeture ${event.code} avant l'instantané`));
        if (!socket.closedByScript) drops.push(`${this.label} : fermeture inattendue ${event.code}`);
      });
      socket.addEventListener('error', () => {
        if (first) reject(new Error(`${this.label} : connexion impossible`));
      });
    });
  }

  send(message) {
    this.socket.send(JSON.stringify(message));
  }

  close() {
    if (!this.socket) return;
    this.socket.closedByScript = true;
    this.socket.close(1000);
  }
}

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`POST ${new URL(url).pathname.replace(/[^/]{22}/, '{id}')} : HTTP ${response.status}`);
  return response.json();
}

/** L'animateur change le statut de la session et attend l'instantané qui le confirme. */
async function changeStatus(run, facilitator, action, status) {
  const changed = run.expectations.expect(action, [facilitator], (s) => s.status === status, now());
  facilitator.send({ type: 'changeStatus', action });
  await changed;
}

const featureOf = (state, featureId) => state.features.find((f) => f.id === featureId);

/** L'animateur crée la session, s'y connecte et ajoute les fonctionnalités une à une. */
async function setUpSession(run) {
  const { options, expectations } = run;
  const created = await post(`${options.url}/api/sessions`, {
    name: `Test de charge ${new Date().toISOString()}`,
    pseudo: 'Animateur',
  });
  run.session = { id: created.sessionId };
  const facilitator = new Peer(run, 'Animateur', created.participantToken, created.animationToken);
  run.peers.push(facilitator);
  await facilitator.connect();
  for (let k = 0; k < options.features; k++) {
    const count = k + 1;
    const added = expectations.expect(`addFeature ${count}`, [facilitator], (s) => s.features.length === count, now());
    facilitator.send({
      type: 'addFeature',
      externalId: `F-${String(count).padStart(3, '0')}`,
      title: `Fonctionnalité ${count}`,
      description: null,
      criteria: Object.fromEntries(CRITERIA.map((key) => [key, randomValue()])),
    });
    await added;
  }
  if (facilitator.state.features.length !== options.features) {
    throw new Error(`${facilitator.state.features.length} fonctionnalités sur ${options.features} ajoutées`);
  }
  await changeStatus(run, facilitator, 'START', 'IN_PROGRESS');
  return facilitator;
}

/** Les autres participants rejoignent la session puis s'y connectent ; renvoie les délais d'ouverture. */
async function joinParticipants(run) {
  const { options } = run;
  const openings = [];
  for (let k = 2; k <= options.participants; k++) {
    const label = `Participant ${k}`;
    const joined = await post(`${options.url}/api/sessions/${run.session.id}/participants`, { pseudo: label });
    const peer = new Peer(run, label, joined.participantToken);
    run.peers.push(peer);
    openings.push(await peer.connect());
  }
  return openings;
}

/** L'animateur modifie une valeur ; chaque participant connecté doit recevoir la nouvelle version. */
async function edit(run, facilitator, index) {
  const { expectations } = run;
  const features = facilitator.state.features;
  const feature = features[Math.floor(Math.random() * features.length)];
  const key = CRITERIA[index % CRITERIA.length];
  const current = feature.criteria[key];
  const value = current === 10 ? 1 : (current ?? 0) + 1;
  const version = feature.version + 1;
  const propagated = expectations.expect(
    `updateFeature ${index + 1} (${feature.externalId})`,
    run.peers.filter((p) => p.open),
    (s) => featureOf(s, feature.id)?.version === version,
    now(),
  );
  facilitator.send({ type: 'updateFeature', featureId: feature.id, version: feature.version, criteria: { [key]: value } });
  await propagated;
}

/** Un ordre au hasard des fonctionnalités, chacune à son niveau, pour le classement de BV (FR-015b). */
function shuffledDraft(features) {
  const ids = features.map((feature) => feature.id).sort(() => Math.random() - 0.5);
  return {
    criterionKeys: ['bv'],
    criterionKey: 'bv',
    levels: ids.map((id) => [id]),
    unranked: [],
    values: Object.fromEntries(ids.map((id, index) => [id, Math.max(10 - index, 1)])),
  };
}

/** L'animateur diffuse un brouillon ; chaque participant connecté doit recevoir la salle qui le porte. */
async function broadcastDraft(run, facilitator, index) {
  const draft = shuffledDraft(facilitator.state.features);
  const levels = JSON.stringify(draft.levels);
  const received = run.expectations.expect(
    `updateRankingDraft ${index + 1}`,
    run.peers.filter((p) => p.open),
    (room) => room.active && JSON.stringify(room.draft.levels) === levels,
    now(),
    'rankingRoom',
  );
  facilitator.send({ type: 'updateRankingDraft', live: true, draft });
  await received;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

/** « p50 … ms, p95 … ms, p99 … ms, max … ms » d'une liste de délais. */
function describe(latencies) {
  const sorted = [...latencies].sort((a, b) => a - b);
  return (
    `p50 ${percentile(sorted, 50).toFixed(1)} ms, p95 ${percentile(sorted, 95).toFixed(1)} ms, ` +
    `p99 ${percentile(sorted, 99).toFixed(1)} ms, max ${(sorted.at(-1) ?? 0).toFixed(1)} ms`
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const run = { options, session: null, peers: [], expectations: new Expectations(options.timeoutMs), drops: [], errors: [] };
  const started = now();
  console.log(
    `Charge : ${options.participants} participants, ${options.features} fonctionnalités, ` +
      `${options.edits} modifications, ${options.drafts} brouillons, contre ${options.url}`,
  );

  const heartbeat = setInterval(() => {
    for (const peer of run.peers) if (peer.open) peer.send({ type: 'heartbeat' });
  }, HEARTBEAT_MS);

  const facilitator = await setUpSession(run);
  console.log(`Session préparée (${options.features} fonctionnalités) en ${Math.round(now() - started)} ms`);
  run.expectations.latencies = [];
  const openings = await joinParticipants(run);

  for (let i = 0; i < options.edits; i++) {
    await edit(run, facilitator, i);
    await sleep(options.pauseMs);
  }
  const propagations = [...run.expectations.latencies];

  run.expectations.latencies = [];
  for (let i = 0; i < options.drafts; i++) {
    await broadcastDraft(run, facilitator, i);
    await sleep(options.pauseMs);
  }
  const drafts = [...run.expectations.latencies];
  if (options.drafts > 0) {
    const ended = run.expectations.expect(
      'endRanking',
      run.peers.filter((p) => p.open),
      (room) => !room.active,
      now(),
      'rankingRoom',
    );
    facilitator.send({ type: 'endRanking', outcome: 'CANCELLED' });
    await ended;
  }

  for (const peer of run.peers) peer.close();
  await sleep(500);
  const reopenings = await Promise.all(run.peers.map((peer) => peer.connect()));

  await changeStatus(run, facilitator, 'CLOSE', 'CLOSED');
  clearInterval(heartbeat);
  for (const peer of run.peers) peer.close();

  const failures = [];
  const report = (label, latencies, limit) => {
    const late = latencies.filter((latency) => latency > limit).length;
    console.log(`${label.padEnd(24)} : ${latencies.length} ; ${describe(latencies)} ; au-delà de ${limit / 1000} s : ${late}`);
    if (late) failures.push(`${late} ${label.toLowerCase()} au-delà de ${limit / 1000} s (max ${Math.max(...latencies).toFixed(1)} ms)`);
  };
  report('Diffusions', propagations, PROPAGATION_LIMIT_MS);
  report('Brouillons diffusés', drafts, PROPAGATION_LIMIT_MS);
  report('Ouvertures', openings, OPENING_LIMIT_MS);
  report('Ouvertures simultanées', reopenings, OPENING_LIMIT_MS);
  if (run.expectations.missed.length) {
    failures.push(`${run.expectations.missed.length} diffusions non reçues, par exemple ${run.expectations.missed[0]}`);
  }
  if (run.errors.length) failures.push(`${run.errors.length} erreurs du webservice, par exemple ${run.errors[0]}`);
  if (run.drops.length) failures.push(`${run.drops.length} connexions tombées, par exemple ${run.drops[0]}`);
  if (failures.length) {
    for (const failure of failures) console.error(`ÉCHEC : ${failure}`);
    process.exit(1);
  }
  console.log(
    'OK : diffusions et brouillons en moins de 2 s, ouvertures en moins de 3 s, aucune erreur, aucune connexion tombée.',
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(`ÉCHEC : ${error.message}`);
  process.exit(1);
});
