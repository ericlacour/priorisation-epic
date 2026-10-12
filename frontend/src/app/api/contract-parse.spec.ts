import { describe, expect, it } from 'vitest';

import {
  addFeatureMessage,
  deleteFeatureMessage,
  parseMethodDefinition,
  parseMethodList,
  parseServerMessage,
  parseSessionState,
  updateFeatureMessage,
} from './contract';
import {
  REACH_EFFORT,
  WSJF,
  feature,
  incompleteFeature,
  maskedFeature,
  participantState,
  sessionState,
} from '../testing/fixtures';

/** Une copie profonde modifiable de la donnée de référence : chaque test en abîme un seul endroit. */
const clone = <T>(value: T): Record<string, unknown> => JSON.parse(JSON.stringify(value));

type Doc = Record<string, unknown>;

/** Le nœud JSON au bout d'un chemin (clés et indices), pour abîmer un seul endroit de la donnée de référence. */
function at(root: unknown, ...path: (string | number)[]): Doc {
  let node: unknown = root;
  for (const key of path) node = (node as Record<string | number, unknown>)[key];
  return node as Doc;
}

const mutate = (change: (state: Doc) => void): unknown => {
  const state = clone(sessionState({ features: [feature(), incompleteFeature()] }));
  change(state);
  return state;
};

describe('parseMethodDefinition', () => {
  it('reads a method with its criteria and computed values', () => {
    expect(parseMethodDefinition(clone(WSJF))).toEqual(WSJF);
    expect(parseMethodDefinition(clone(REACH_EFFORT))).toEqual(REACH_EFFORT);
  });

  it.each([
    ['not an object', 'WSJF'],
    ['without key', { ...WSJF, key: '' }],
    ['with a version that is not an integer', { ...WSJF, version: 1.5 }],
    ['without a name', { ...WSJF, name: undefined }],
    ['without criteria', { ...WSJF, criteria: [] }],
    ['with criteria that are not a list', { ...WSJF, criteria: 'bv' }],
    [
      'with a criterion without its sigle',
      { ...WSJF, criteria: [{ ...WSJF.criteria[0], code: '' }] },
    ],
    [
      'with an unknown display kind',
      { ...WSJF, computedValues: [{ ...WSJF.computedValues[0], display: 'PERCENT' }] },
    ],
    ['without a formula', { ...WSJF, formula: undefined }],
    ['without a tie-break rule', { ...WSJF, tieBreakRule: '' }],
  ])('refuses a definition %s', (_name, json) => {
    expect(() => parseMethodDefinition(json)).toThrow('unexpected shape');
  });
});

describe('parseMethodList', () => {
  it('reads the offered methods', () => {
    expect(parseMethodList([clone(WSJF), clone(REACH_EFFORT)])).toEqual([WSJF, REACH_EFFORT]);
  });

  it.each([[[]], ['WSJF'], [[{ key: 'x' }]]])('refuses %j', (json) => {
    expect(() => parseMethodList(json)).toThrow('unexpected shape');
  });
});

describe('parseSessionState', () => {
  it('reads what the server sends to the facilitator, features included', () => {
    const state = sessionState({ features: [feature(), incompleteFeature()] });
    expect(parseSessionState(clone(state))).toEqual(state);
  });

  it('reads the view of a participant during a round: masked values are null', () => {
    const state = participantState({ features: [maskedFeature(), feature()] });
    const read = parseSessionState(clone(state));
    expect(read.features[0].criteria).toBeNull();
    expect(read.features[0].score).toBeNull();
    expect(read.features[0].votingInProgress).toBe(true);
    expect(read.me?.role).toBe('PARTICIPANT');
  });

  it('reads the read-only consultation view, where nobody is « me »', () => {
    expect(parseSessionState(clone(sessionState({ me: null }))).me).toBeNull();
  });

  it('reads a Fibonacci scale and one without its list of values', () => {
    const fibonacci = sessionState({
      scale: { type: 'FIBONACCI', max: 13, allowedValues: [1, 2, 3, 5, 8, 13] },
    });
    expect(parseSessionState(clone(fibonacci)).scale.allowedValues).toEqual([1, 2, 3, 5, 8, 13]);
    const bare = sessionState({ scale: { type: 'CONTINUOUS', max: 7 } });
    expect(parseSessionState(clone(bare)).scale).toEqual({ type: 'CONTINUOUS', max: 7 });
  });

  it('reads optional fields only when present', () => {
    const state = mutate((s) => {
      delete at(s, 'features', 0)['votingInProgress'];
      delete at(s, 'participants', 0)['businessRole'];
    });
    const read = parseSessionState(state);
    expect('votingInProgress' in read.features[0]).toBe(false);
    expect('businessRole' in read.participants[0]).toBe(false);
  });

  it.each([
    ['another message type', (s: Doc) => (s['type'] = 'tick')],
    ['an unknown status', (s: Doc) => (s['status'] = 'ARCHIVED')],
    ['a version that is not an integer', (s: Doc) => (s['version'] = '1')],
    ['no session id', (s: Doc) => (s['sessionId'] = '')],
    ['an unknown scale type', (s: Doc) => (at(s, 'scale')['type'] = 'LINEAR')],
    ['a scale max with decimals', (s: Doc) => (at(s, 'scale')['max'] = 1.5)],
    ['scale values that are not a list', (s: Doc) => (at(s, 'scale')['allowedValues'] = 'x')],
    ['an unknown role for me', (s: Doc) => (at(s, 'me')['role'] = 'ADMIN')],
    ['an unknown participant role', (s: Doc) => (at(s, 'participants', 0)['role'] = 'GUEST')],
    ['a participant without online status', (s: Doc) => delete at(s, 'participants', 0)['online']],
    ['participants that are not a list', (s: Doc) => (s['participants'] = {})],
    ['a feature without id', (s: Doc) => (at(s, 'features', 0)['id'] = '')],
    [
      'a feature description of the wrong type',
      (s: Doc) => (at(s, 'features', 0)['description'] = 3),
    ],
    [
      'a feature with a decimal criterion',
      (s: Doc) => (at(s, 'features', 0, 'criteria')['bv'] = 1.5),
    ],
    [
      'a feature with criteria that are not an object',
      (s: Doc) => (at(s, 'features', 0)['criteria'] = []),
    ],
    ['a non-boolean review mark', (s: Doc) => (at(s, 'features', 0)['markedForReview'] = 'oui')],
    ['a non-boolean voting flag', (s: Doc) => (at(s, 'features', 0)['votingInProgress'] = 'oui')],
    ['a score without completeness', (s: Doc) => delete at(s, 'features', 0, 'score')['complete']],
    [
      'a score rank that is not an integer',
      (s: Doc) => (at(s, 'features', 0, 'score')['rank'] = 'un'),
    ],
    [
      'a computed value without display',
      (s: Doc) => delete at(s, 'features', 0, 'score', 'computed', 'wsjf')['display'],
    ],
    [
      'computed values that are not an object',
      (s: Doc) => (at(s, 'features', 0, 'score')['computed'] = 3),
    ],
    [
      'out-of-scale keys that are not text',
      (s: Doc) => (at(s, 'features', 0, 'score')['outOfScale'] = [3]),
    ],
    ['an invalid method definition', (s: Doc) => (at(s, 'methodDefinition')['criteria'] = [])],
  ])('refuses a state with %s', (_name, change) => {
    expect(() => parseSessionState(mutate(change))).toThrow('unexpected shape');
  });

  it('refuses anything that is not an object', () => {
    expect(() => parseSessionState(null)).toThrow();
    expect(() => parseSessionState([])).toThrow();
  });
});

describe('parseServerMessage with a session state', () => {
  it('returns the state when it respects the contract', () => {
    const state = sessionState();
    expect(parseServerMessage(clone(state))).toEqual(state);
  });

  it('drops a session state that does not respect the contract, instead of showing it', () => {
    expect(parseServerMessage(mutate((s) => (s['status'] = 'ARCHIVED')))).toBeNull();
  });

  it('reads an error with the feature it concerns, and refuses an unknown code', () => {
    expect(parseServerMessage({ type: 'error', code: 'STALE_VERSION', featureId: 'f1' })).toEqual({
      type: 'error',
      code: 'STALE_VERSION',
      featureId: 'f1',
    });
    expect(parseServerMessage({ type: 'error', code: 'STALE_VERSION' })).toEqual({
      type: 'error',
      code: 'STALE_VERSION',
    });
    expect(parseServerMessage({ type: 'error', code: 'WHATEVER' })).toBeNull();
  });
});

describe('intentions', () => {
  it('builds the three feature intentions of the contract', () => {
    expect(addFeatureMessage({ externalId: 'F-1', title: 'T', criteria: { bv: 3 } })).toEqual({
      type: 'addFeature',
      externalId: 'F-1',
      title: 'T',
      criteria: { bv: 3 },
    });
    expect(updateFeatureMessage('id', 2, { title: 'N', markedForReview: true })).toEqual({
      type: 'updateFeature',
      featureId: 'id',
      version: 2,
      title: 'N',
      markedForReview: true,
    });
    expect(deleteFeatureMessage('id', 2)).toEqual({
      type: 'deleteFeature',
      featureId: 'id',
      version: 2,
    });
  });
});
