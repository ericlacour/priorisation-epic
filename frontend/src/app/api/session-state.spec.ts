import { describe, expect, it } from 'vitest';

import { F1, F2, WSJF, state } from '../testing/fixtures';
import { parseMethodDefinition, parseMethodList, parseSessionState } from './session-state';

/** Un état de test comme le serveur l'enverrait : JSON pur. */
const wire = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...JSON.parse(JSON.stringify(state())),
  ...overrides,
});

describe('session-state', () => {
  it('reads a complete sessionState', () => {
    const read = parseSessionState(wire());
    expect(read).toEqual(state());
    expect(read?.features[0].score?.computed?.['wsjf'].display).toBe('4,00');
  });

  it('keeps criteria opaque: any key of any method is read', () => {
    const fake = { ...WSJF, criteria: [{ ...WSJF.criteria[0], key: 'reach' }] };
    const read = parseSessionState(
      wire({
        methodDefinition: fake,
        features: [{ ...F2, criteria: { reach: 4, effort: null } }],
      }),
    );
    expect(read?.features[0].criteria).toEqual({ reach: 4, effort: null });
  });

  it('reads the read-only view where me is null', () => {
    expect(parseSessionState(wire({ me: null }))?.me).toBeNull();
  });

  it('reads masked features where criteria and score are null', () => {
    const masked = { ...F1, criteria: null, score: null, votingInProgress: true };
    const read = parseSessionState(wire({ features: [masked] }));
    expect(read?.features[0].criteria).toBeNull();
    expect(read?.features[0].score).toBeNull();
  });

  it('refuses a message that breaks the contract', () => {
    for (const bad of [
      wire({ type: 'tick' }),
      wire({ version: 'x' }),
      wire({ status: 'DONE' }),
      wire({ scale: { type: 'CONTINUOUS', max: 10 } }),
      wire({ me: { participantId: 'p', pseudo: 'x', role: 'ROOT' } }),
      wire({ participants: [{ participantId: 'p' }] }),
      wire({ features: [{ id: 'f' }] }),
      wire({ features: [{ ...F1, criteria: { bv: 'a' } }] }),
      wire({ features: [{ ...F1, score: { complete: true } }] }),
      wire({ features: [{ ...F1, score: { ...F1.score, computed: { wsjf: { numerator: 1 } } } }] }),
      wire({ features: [{ ...F1, score: { ...F1.score, rank: 'x' } }] }),
      wire({ methodDefinition: { ...WSJF, criteria: [] } }),
      wire({ methodDefinition: null }),
      null,
      [],
      'x',
    ]) {
      expect(parseSessionState(bad)).toBeNull();
    }
  });

  it('reads a method definition and a method list', () => {
    expect(parseMethodDefinition(JSON.parse(JSON.stringify(WSJF)))).toEqual(WSJF);
    expect(parseMethodList([JSON.parse(JSON.stringify(WSJF))])).toEqual([WSJF]);
    expect(parseMethodList([])).toBeNull();
    expect(parseMethodList([{ key: 'x' }])).toBeNull();
    expect(parseMethodList({})).toBeNull();
    expect(
      parseMethodDefinition({
        ...WSJF,
        computedValues: [{ ...WSJF.computedValues[0], display: 'FLOAT' }],
      }),
    ).toBeNull();
  });
});
