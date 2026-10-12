// Validation du contrat : documents OpenAPI et AsyncAPI, exemples contre leurs
// JSON Schema, couverture (chaque charge utile a au moins un exemple)
// et règles métier sur sessionState (point d'extension SESSION_STATE_RULES).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Parser, fromFile } from '@asyncapi/parser';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse as parseYaml } from 'yaml';

const require = createRequire(import.meta.url);

// Surface autorisée : tout ce que la spec prévoit pour la V1. Le contrat ne reçoit que des opérations et des
// messages de cette liste ; chaque tâche de parcours ajoute les siens au contrat, jamais ici.
const ALLOWED_OPERATIONS = [
  'GET /api/health',
  'GET /api/sessions',
  'POST /api/sessions',
  'GET /api/sessions/{sessionId}',
  'POST /api/sessions/{sessionId}/participants',
  'POST /api/sessions/{sessionId}/imports',
  'POST /api/sessions/{sessionId}/imports/{previewId}/confirm',
  'GET /api/methods',
  'GET /api/import-template.xlsx',
  'GET /api/sessions/{sessionId}/exports/{format}',
];
// Opérations obligatoires, dès la phase des fondations.
const REQUIRED_OPERATIONS = ['GET /api/health'];
// Message → action de l'opération, du point de vue du webservice.
const MESSAGE_ACTIONS = {
  hello: 'receive',
  heartbeat: 'receive',
  addFeature: 'receive',
  updateFeature: 'receive',
  deleteFeature: 'receive',
  updateSettings: 'receive',
  changeStatus: 'receive',
  openRound: 'receive',
  castVote: 'receive',
  revealRound: 'receive',
  transferFacilitator: 'receive',
  sessionState: 'send',
  facilitatorHandover: 'send',
  tick: 'send',
  error: 'send',
};
const REQUIRED_MESSAGES = ['hello', 'heartbeat', 'tick', 'error'];
const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query'];
const SCHEMA_REF = /^\.\/schemas\/([a-z0-9-]+)\.json$/;

export async function validateContract(root) {
  const errors = [];
  const stats = { schemas: 0, examples: 0 };
  const rel = (path) => relative(root, path);

  const openapiPath = join(root, 'openapi.yaml');
  const asyncapiPath = join(root, 'asyncapi.yaml');
  const openapi = parseYaml(readFileSync(openapiPath, 'utf8'));
  const asyncapi = parseYaml(readFileSync(asyncapiPath, 'utf8'));

  errors.push(...lintOpenapi(root, openapiPath, rel));
  errors.push(...(await lintAsyncapi(asyncapiPath, rel)));
  errors.push(...checkSurface(openapi, asyncapi));

  // Schémas : chacun compilé une fois, référencé par son $id (nom de fichier).
  const ajv = new Ajv2020({ allErrors: true, strictTypes: false });
  addFormats(ajv);
  const schemasDir = join(root, 'schemas');
  const schemaNames = readdirSync(schemasDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5));
  for (const name of schemaNames) {
    const schema = readJson(join(schemasDir, `${name}.json`), errors, rel);
    if (!schema) continue;
    if (schema.$id !== `${name}.json`)
      errors.push(`schemas/${name}.json : $id doit valoir "${name}.json"`);
    ajv.addSchema(schema);
  }
  for (const name of schemaNames) {
    try {
      ajv.getSchema(`${name}.json`);
      stats.schemas++;
    } catch (e) {
      errors.push(`schemas/${name}.json : ne compile pas : ${e.message}`);
    }
  }

  // Couverture : toute charge utile référencée par un document a un dossier d'exemples.
  const payloads = new Set([
    ...collectSchemaRefs(openapi.paths),
    ...collectSchemaRefs(openapi.components?.responses),
    ...collectSchemaRefs(asyncapi.components?.messages),
  ]);
  const examplesDir = join(root, 'examples');
  const exampleDirs = existsSync(examplesDir) ? readdirSync(examplesDir) : [];
  for (const name of payloads) {
    if (!exampleDirs.includes(name) || listJson(join(examplesDir, name)).length === 0) {
      errors.push(`examples/${name}/ : aucun exemple pour la charge utile schemas/${name}.json`);
    }
  }

  // Exemples : examples/<schéma>/<cas>.json est validé contre schemas/<schéma>.json.
  const examples = {};
  for (const dir of exampleDirs) {
    const validate = schemaNames.includes(dir) ? ajv.getSchema(`${dir}.json`) : null;
    if (!validate) {
      errors.push(`examples/${dir}/ : aucun schéma schemas/${dir}.json ne correspond`);
      continue;
    }
    for (const file of listJson(join(examplesDir, dir))) {
      const path = join(examplesDir, dir, file);
      const data = readJson(path, errors, rel);
      if (data === undefined) continue;
      stats.examples++;
      const valid = validate(data);
      if (!valid) errors.push(...formatAjv(rel(path), validate.errors));
      (examples[dir] ??= []).push({ path: rel(path), file, data, valid });
    }
  }

  errors.push(...checkProblemResponses(openapi, ajv, examples.problem ?? []));
  // Les règles d'métier ne portent que sur des exemples déjà conformes à leur schéma.
  errors.push(...checkSessionStates((examples['session-state'] ?? []).filter((e) => e.valid)));
  return { errors, stats };
}

function lintOpenapi(root, path, rel) {
  const cli = join(require.resolve('@redocly/cli/package.json'), '..', 'bin', 'cli.js');
  const run = spawnSync(
    process.execPath,
    [cli, 'lint', path, `--config=${join(root, 'redocly.yaml')}`, '--format=stylish'],
    {
      encoding: 'utf8',
      env: { ...process.env, REDOCLY_TELEMETRY: 'off', REDOCLY_SUPPRESS_UPDATE_NOTICE: 'true' },
    },
  );
  if (run.status === 0) return [];
  const output = `${run.stdout}\n${run.stderr}`
    .split('\n')
    .filter((l) => /error|warning|✗|❌/i.test(l))
    .join('\n');
  return [`${rel(path)} : invalide selon OpenAPI 3.2 (Redocly)\n${output.trim()}`];
}

async function lintAsyncapi(path, rel) {
  const { diagnostics } = await fromFile(new Parser(), path).parse();
  return diagnostics
    .filter((d) => d.severity === 0)
    .map((d) => `${rel(path)} : invalide selon AsyncAPI 3.1 : ${d.message} (${d.path.join('.')})`);
}

function checkSurface(openapi, asyncapi) {
  const errors = [];
  const operations = Object.entries(openapi.paths ?? {}).flatMap(([path, item]) =>
    [
      ...Object.keys(item).filter((m) => HTTP_METHODS.includes(m)),
      ...Object.keys(item.additionalOperations ?? {}),
    ].map((m) => `${m.toUpperCase()} ${path}`),
  );
  for (const op of operations.filter((o) => !ALLOWED_OPERATIONS.includes(o))) {
    errors.push(
      `openapi.yaml : la surface REST ne prévoit pas ${op} (autorisées : ${ALLOWED_OPERATIONS.join(', ')})`,
    );
  }
  for (const op of REQUIRED_OPERATIONS.filter((o) => !operations.includes(o))) {
    errors.push(`openapi.yaml : la surface REST doit contenir ${op}`);
  }

  const components = Object.entries(asyncapi.components?.messages ?? {});
  const names = components.map(([, m]) => m.name);
  for (const [key, m] of components) {
    if (key !== m.name)
      errors.push(
        `asyncapi.yaml : le message ${key} doit porter le même nom que sa clé (name: ${m.name})`,
      );
    if (!(m.name in MESSAGE_ACTIONS)) {
      errors.push(
        `asyncapi.yaml : les messages possibles sont ${Object.keys(MESSAGE_ACTIONS).join(', ')} (trouvé : ${m.name})`,
      );
    }
  }
  for (const name of REQUIRED_MESSAGES.filter((n) => !names.includes(n))) {
    errors.push(`asyncapi.yaml : le message ${name} est obligatoire`);
  }
  const channelMessages = Object.values(asyncapi.channels ?? {}).flatMap((c) =>
    Object.keys(c.messages ?? {}),
  );
  if (!sameSet(channelMessages, names)) {
    errors.push(
      `asyncapi.yaml : le canal doit porter exactement les messages déclarés ${names.join(', ')} (trouvé : ${channelMessages.join(', ')})`,
    );
  }
  // Chaque message a exactement une opération, dans le bon sens.
  const actions = {};
  for (const op of Object.values(asyncapi.operations ?? {})) {
    for (const ref of op.messages ?? [])
      (actions[ref.$ref?.split('/').at(-1)] ??= []).push(op.action);
  }
  for (const name of names.filter((n) => n in MESSAGE_ACTIONS)) {
    const action = MESSAGE_ACTIONS[name];
    if (actions[name]?.length !== 1 || actions[name][0] !== action) {
      errors.push(
        `asyncapi.yaml : ${name} doit avoir exactement une opération ${action} (trouvé : ${actions[name]?.join(', ') ?? 'aucune'})`,
      );
    }
  }
  return errors;
}

// Chaque réponse d'erreur nommée (BadRequest, SessionNotFound…) a au moins un exemple
// examples/problem/<nom-en-kebab>*.json, valide contre le schéma exact de cette réponse.
function checkProblemResponses(openapi, ajv, problems) {
  const errors = [];
  const responses = Object.entries(openapi.components?.responses ?? {})
    .filter(([, r]) => r.content?.['application/problem+json'])
    .map(([name, r]) => {
      const prefix = name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
      const schema = rewriteRefs(r.content['application/problem+json'].schema);
      return { name, prefix, validate: ajv.compile(schema) };
    });
  for (const { name, prefix, validate } of responses) {
    const matching = problems.filter((p) => p.file.startsWith(prefix));
    if (matching.length === 0)
      errors.push(`examples/problem/ : aucun exemple ${prefix}*.json pour la réponse ${name}`);
    for (const p of matching) {
      if (!validate(p.data))
        errors.push(...formatAjv(`${p.path} (réponse ${name})`, validate.errors));
    }
  }
  for (const p of problems) {
    if (!responses.some((r) => p.file.startsWith(r.prefix))) {
      errors.push(
        `${p.path} : le nom doit commencer par celui d'une réponse (${responses.map((r) => r.prefix).join(', ')})`,
      );
    }
  }
  return errors;
}

// Point d'extension : règles métier sur `sessionState` qu'un JSON Schema ne sait pas exprimer (ajoutées en T070).
// Chaque règle reçoit l'état d'un exemple et une fonction `fail(message)`.
export const SESSION_STATE_RULES = [];

function checkSessionStates(states, rules = SESSION_STATE_RULES) {
  const errors = [];
  for (const { path, data } of states) {
    const fail = (msg) => errors.push(`${path} : ${msg}`);
    for (const rule of rules) rule(data, fail);
  }
  return errors;
}

function collectSchemaRefs(node, found = new Set()) {
  if (Array.isArray(node)) node.forEach((n) => collectSchemaRefs(n, found));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      const match = key === '$ref' && typeof value === 'string' && value.match(SCHEMA_REF);
      if (match) found.add(match[1]);
      else collectSchemaRefs(value, found);
    }
  }
  return found;
}

function rewriteRefs(node) {
  if (Array.isArray(node)) return node.map(rewriteRefs);
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(
    Object.entries(node).map(([k, v]) => [
      k,
      k === '$ref' && typeof v === 'string' ? v.replace(/^\.\/schemas\//, '') : rewriteRefs(v),
    ]),
  );
}

function formatAjv(where, ajvErrors) {
  return ajvErrors.map(
    (e) =>
      `${where} : ${e.instancePath || '/'} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`,
  );
}

function readJson(path, errors, rel) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    errors.push(`${rel(path)} : JSON illisible : ${e.message}`);
    return undefined;
  }
}

const listJson = (dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
const sameSet = (a, b) => a.length === b.length && b.every((x) => a.includes(x));

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), '..', '..');
  const { errors, stats } = await validateContract(root);
  if (errors.length > 0) {
    console.error(`Contrat invalide : ${errors.length} erreur(s)\n`);
    for (const e of errors) console.error(`- ${e}`);
    process.exit(1);
  }
  console.log(
    `Contrat valide : openapi.yaml (OpenAPI 3.2.0), asyncapi.yaml (AsyncAPI 3.1.0), ${stats.schemas} schémas, ${stats.examples} exemples.`,
  );
}
