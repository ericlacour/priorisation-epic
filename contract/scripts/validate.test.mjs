// Chaque test travaille sur une copie du contrat, la fausse, et vérifie que la validation le détecte.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SESSION_STATE_RULES, validateContract } from './validate.mjs';

const source = resolve(fileURLToPath(import.meta.url), '..', '..');
const copies = [];
after(() => copies.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function copyContract() {
  const dir = mkdtempSync(join(tmpdir(), 'contract-'));
  copies.push(dir);
  for (const entry of ['openapi.yaml', 'asyncapi.yaml', 'redocly.yaml', 'schemas', 'examples']) {
    cpSync(join(source, entry), join(dir, entry), { recursive: true });
  }
  return dir;
}

function editJson(dir, path, change) {
  const file = join(dir, path);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  change(data);
  writeFileSync(file, JSON.stringify(data));
}

function editText(dir, path, from, to) {
  const file = join(dir, path);
  const text = readFileSync(file, 'utf8');
  assert.ok(text.includes(from), `${path} ne contient pas ${from}`);
  writeFileSync(file, text.replace(from, to));
}

const hasError = (errors, ...parts) => errors.some((e) => parts.every((p) => e.includes(p)));

test('le contrat livré est valide', async () => {
  const { errors, stats } = await validateContract(source);
  assert.deepEqual(errors, []);
  assert.ok(stats.schemas >= 20);
  assert.ok(stats.examples > 0);
});

test('un exemple sans champ requis est signalé avec son fichier', async () => {
  const dir = copyContract();
  editJson(dir, 'examples/hello/participant.json', (s) => delete s.participantToken);
  const { errors } = await validateContract(dir);
  assert.ok(
    hasError(errors, 'examples/hello/participant.json', 'participantToken'),
    errors.join('\n'),
  );
});

test('un champ non décrit par le contrat est refusé', async () => {
  const dir = copyContract();
  editJson(dir, 'examples/tick/tick.json', (s) => {
    s.serverTime = '2026-10-01T12:00:00Z';
  });
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'examples/tick/tick.json', 'serverTime'), errors.join('\n'));
});

test("un code d'erreur inconnu est refusé", async () => {
  const dir = copyContract();
  editJson(dir, 'examples/error/stale-version.json', (s) => {
    s.code = 'TEAPOT';
  });
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'examples/error/stale-version.json'), errors.join('\n'));
});

test('une clé de critère mal formée est refusée', async () => {
  const dir = copyContract();
  editJson(dir, 'examples/criteria/wsjf-complete.json', (s) => {
    s.BV = 3;
  });
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'examples/criteria/wsjf-complete.json'), errors.join('\n'));
});

test('une valeur de critère inférieure à 1 est refusée', async () => {
  const dir = copyContract();
  editJson(dir, 'examples/criteria/wsjf-complete.json', (s) => {
    s.bv = 0;
  });
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'examples/criteria/wsjf-complete.json'), errors.join('\n'));
});

test('un message sans exemple est signalé', async () => {
  const dir = copyContract();
  rmSync(join(dir, 'examples/tick'), { recursive: true });
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'examples/tick/', 'aucun exemple'), errors.join('\n'));
});

test("un dossier d'exemples sans schéma est signalé", async () => {
  const dir = copyContract();
  mkdirSync(join(dir, 'examples/ghost'));
  writeFileSync(join(dir, 'examples/ghost/a.json'), '{}');
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'examples/ghost/', 'aucun schéma'), errors.join('\n'));
});

test('un exemple JSON illisible est signalé', async () => {
  const dir = copyContract();
  writeFileSync(join(dir, 'examples/tick/broken.json'), '{');
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'examples/tick/broken.json', 'illisible'), errors.join('\n'));
});

test('un $id qui ne correspond pas au nom du fichier est signalé', async () => {
  const dir = copyContract();
  editJson(dir, 'schemas/tick.json', (s) => {
    s.$id = 'tock.json';
  });
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'schemas/tick.json', '$id'), errors.join('\n'));
});

test("une réponse d'erreur REST sans exemple est signalée", async () => {
  const dir = copyContract();
  rmSync(join(dir, 'examples/problem/pseudo-taken.json'));
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'pseudo-taken', 'PseudoTaken'), errors.join('\n'));
});

test('un problème sans detail est refusé', async () => {
  const dir = copyContract();
  editJson(dir, 'examples/problem/forbidden.json', (p) => delete p.detail);
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'forbidden.json', 'detail'), errors.join('\n'));
});

test("un exemple d'erreur REST dont le nom ne correspond à aucune réponse est refusé", async () => {
  const dir = copyContract();
  writeFileSync(
    join(dir, 'examples/problem/teapot.json'),
    JSON.stringify({ title: 'Teapot', status: 418, detail: 'x' }),
  );
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'teapot.json', 'le nom doit commencer'), errors.join('\n'));
});

test('un $ref cassé dans asyncapi.yaml est signalé', async () => {
  const dir = copyContract();
  editText(dir, 'asyncapi.yaml', './schemas/tick.json', './schemas/tock.json');
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'asyncapi.yaml'), errors.join('\n'));
});

test('un document OpenAPI invalide est signalé', async () => {
  const dir = copyContract();
  editText(
    dir,
    'openapi.yaml',
    'operationId: getHealth',
    'operationId: getHealth\n      parameters: oops',
  );
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'openapi.yaml', 'OpenAPI'), errors.join('\n'));
});

test('un endpoint hors de la surface prévue est refusé', async () => {
  const dir = copyContract();
  editText(
    dir,
    'openapi.yaml',
    '  /api/health:\n    get:',
    "  /api/health:\n    delete:\n      operationId: deleteHealth\n      responses:\n        '204':\n          description: x\n    get:",
  );
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'surface REST', 'DELETE /api/health'), errors.join('\n'));
});

test('une opération OpenAPI 3.2 additionalOperations hors surface est refusée', async () => {
  const dir = copyContract();
  editText(
    dir,
    'openapi.yaml',
    '  /api/health:\n    get:',
    "  /api/health:\n    additionalOperations:\n      PURGE:\n        operationId: purgeHealth\n        responses:\n          '204':\n            description: x\n    get:",
  );
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'surface REST', 'PURGE /api/health'), errors.join('\n'));
});

test('la sonde de santé est obligatoire', async () => {
  const dir = copyContract();
  editText(dir, 'openapi.yaml', '  /api/health:', '  /api/sante:');
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'surface REST', 'GET /api/health'), errors.join('\n'));
});

test('un message inconnu de la spec est refusé', async () => {
  const dir = copyContract();
  editText(
    dir,
    'asyncapi.yaml',
    'components:\n  messages:\n',
    "components:\n  messages:\n    ping:\n      name: ping\n      payload:\n        $ref: './schemas/tick.json'\n",
  );
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'asyncapi.yaml', 'ping'), errors.join('\n'));
});

test('un message obligatoire retiré est refusé', async () => {
  const dir = copyContract();
  editText(dir, 'asyncapi.yaml', "      tick:\n        $ref: '#/components/messages/tick'\n", '');
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'asyncapi.yaml', 'canal'), errors.join('\n'));
});

test('une opération dans le mauvais sens est refusée', async () => {
  const dir = copyContract();
  editText(
    dir,
    'asyncapi.yaml',
    '  receiveHello:\n    action: receive',
    '  receiveHello:\n    action: send',
  );
  const { errors } = await validateContract(dir);
  assert.ok(
    hasError(errors, 'hello doit avoir exactement une opération receive'),
    errors.join('\n'),
  );
});

test('un message dont la clé diffère du nom est refusé', async () => {
  const dir = copyContract();
  editText(dir, 'asyncapi.yaml', '      name: heartbeat\n', '      name: tick\n');
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'asyncapi.yaml', 'heartbeat'), errors.join('\n'));
});

test("le point d'extension sessionState applique les règles métier aux exemples valides", async () => {
  const dir = copyContract();
  editJson(dir, 'schemas/tick.json', (s) => s);
  const stateSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'session-state.json',
    type: 'object',
  };
  writeFileSync(join(dir, 'schemas/session-state.json'), JSON.stringify(stateSchema));
  rmSync(join(dir, 'examples/session-state'), { recursive: true, force: true });
  mkdirSync(join(dir, 'examples/session-state'));
  writeFileSync(join(dir, 'examples/session-state/a.json'), JSON.stringify({ broken: true }));
  SESSION_STATE_RULES.push((state, fail) => {
    if (state.broken) fail('état cassé');
  });
  try {
    const { errors } = await validateContract(dir);
    assert.ok(hasError(errors, 'examples/session-state/a.json', 'état cassé'), errors.join('\n'));
  } finally {
    SESSION_STATE_RULES.pop();
  }
});

test('un schéma qui nomme un critère du WSJF en propriété est refusé', async () => {
  const dir = copyContract();
  editJson(dir, 'schemas/feature.json', (s) => {
    s.properties.bv = { type: 'integer' };
  });
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'schemas/feature.json', 'bv', 'WSJF'), errors.join('\n'));
});

test('un schéma qui nomme un critère du WSJF en valeur est refusé', async () => {
  const dir = copyContract();
  editJson(dir, 'schemas/score.json', (s) => {
    s.properties.outOfScale.items = { enum: ['rrOe', 'js'] };
  });
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'schemas/score.json', 'rrOe', 'WSJF'), errors.join('\n'));
});

test('un exemple peut nommer les critères du WSJF', async () => {
  const { errors } = await validateContract(source);
  assert.equal(errors.filter((e) => e.includes('WSJF') && e.includes('examples/')).length, 0);
});

test('un exemple de session sans définition de méthode est refusé', async () => {
  const dir = copyContract();
  editJson(dir, 'examples/session-state/participant-view.json', (s) => delete s.methodDefinition);
  const { errors } = await validateContract(dir);
  assert.ok(
    hasError(errors, 'examples/session-state/participant-view.json', 'methodDefinition'),
    errors.join('\n'),
  );
});

// Salle de classement (FR-015b, FR-015c, T126).
const ACTIVE_ROOM = 'examples/ranking-room/active.json';
const F3 = '8b3e4f50-6d7c-4e9f-8a01-2c3d4e5f6071';

test('une salle active sans brouillon est refusée', async () => {
  const dir = copyContract();
  editJson(dir, ACTIVE_ROOM, (s) => delete s.draft);
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, ACTIVE_ROOM, 'draft'), errors.join('\n'));
});

test('une salle fermée ne porte que son motif de fin', async () => {
  const dir = copyContract();
  editJson(dir, 'examples/ranking-room/ended-saved.json', (s) => {
    s.live = true;
  });
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, 'examples/ranking-room/ended-saved.json'), errors.join('\n'));

  const other = copyContract();
  editJson(other, 'examples/ranking-room/ended-saved.json', (s) => delete s.endReason);
  const result = await validateContract(other);
  assert.ok(
    hasError(result.errors, 'examples/ranking-room/ended-saved.json', 'endReason'),
    result.errors.join('\n'),
  );
});

test('une salle active ne porte pas de motif de fin', async () => {
  const dir = copyContract();
  editJson(dir, ACTIVE_ROOM, (s) => {
    s.endReason = 'SAVED';
  });
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, ACTIVE_ROOM), errors.join('\n'));
});

test('un brouillon diffusé sans brouillon est refusé', async () => {
  const dir = copyContract();
  editJson(dir, 'examples/update-ranking-draft/live.json', (s) => delete s.draft);
  const { errors } = await validateContract(dir);
  assert.ok(
    hasError(errors, 'examples/update-ranking-draft/live.json', 'draft'),
    errors.join('\n'),
  );
});

test('une fonctionnalité deux fois dans un brouillon est refusée', async () => {
  const dir = copyContract();
  editJson(dir, ACTIVE_ROOM, (s) => s.draft.unranked.push(F3));
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, ACTIVE_ROOM, F3, 'plusieurs fois'), errors.join('\n'));
});

test('un critère en cours hors des critères choisis est refusé', async () => {
  const dir = copyContract();
  editJson(dir, 'examples/update-ranking-draft/live.json', (s) => {
    s.draft.criterionKey = 'tc';
  });
  const { errors } = await validateContract(dir);
  assert.ok(
    hasError(errors, 'examples/update-ranking-draft/live.json', 'tc', 'critères choisis'),
    errors.join('\n'),
  );
});

test('une valeur pour une fonctionnalité non classée est refusée', async () => {
  const dir = copyContract();
  editJson(dir, 'examples/update-ranking-draft/with-unranked.json', (s) => {
    s.draft.values[s.draft.unranked[0]] = 2;
  });
  const { errors } = await validateContract(dir);
  assert.ok(
    hasError(errors, 'examples/update-ranking-draft/with-unranked.json', 'sans être classée'),
    errors.join('\n'),
  );
});

test("deux avis d'un même membre sur une carte et un critère sont refusés", async () => {
  const dir = copyContract();
  editJson(dir, ACTIVE_ROOM, (s) => s.opinions.push({ ...s.opinions[1], opinion: 'LOWER' }));
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, ACTIVE_ROOM, 'un seul par membre'), errors.join('\n'));
});

test('un avis ou une carte en discussion hors du brouillon sont refusés', async () => {
  const dir = copyContract();
  editJson(dir, ACTIVE_ROOM, (s) => {
    s.draft.levels = [s.draft.levels[0]];
    s.draft.values = { [s.draft.levels[0][0]]: 8 };
  });
  const { errors } = await validateContract(dir);
  assert.ok(hasError(errors, ACTIVE_ROOM, 'hors du brouillon'), errors.join('\n'));
  assert.ok(hasError(errors, ACTIVE_ROOM, 'carte en discussion'), errors.join('\n'));
});

test('un avis inconnu est refusé', async () => {
  const dir = copyContract();
  editJson(dir, 'examples/give-opinion/agree-without-comment.json', (s) => {
    s.opinion = 'QUESTION';
  });
  const { errors } = await validateContract(dir);
  assert.ok(
    hasError(errors, 'examples/give-opinion/agree-without-comment.json', 'opinion'),
    errors.join('\n'),
  );
});

test('un commentaire de plus de 140 caractères est refusé', async () => {
  const dir = copyContract();
  editJson(dir, 'examples/give-opinion/raise-with-comment.json', (s) => {
    s.comment = 'x'.repeat(141);
  });
  const { errors } = await validateContract(dir);
  assert.ok(
    hasError(errors, 'examples/give-opinion/raise-with-comment.json', 'comment'),
    errors.join('\n'),
  );
});
