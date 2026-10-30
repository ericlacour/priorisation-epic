import { describe, expect, it } from 'vitest';

import {
  heartbeatMessage,
  helloMessage,
  isRankingRoom,
  isSessionId,
  parseCreateSessionResponse,
  parseImportPreview,
  parseImportResult,
  parseJoinSessionResponse,
  parseProblem,
  parseServerMessage,
  parseSessionSummaries,
} from './contract';

describe('contract', () => {
  it('builds hello with or without the animation token', () => {
    expect(helloMessage('p')).toEqual({ type: 'hello', participantToken: 'p' });
    expect(helloMessage('p', null)).toEqual({ type: 'hello', participantToken: 'p' });
    expect(helloMessage('p', 'a')).toEqual({
      type: 'hello',
      participantToken: 'p',
      animationToken: 'a',
    });
    expect(heartbeatMessage()).toEqual({ type: 'heartbeat' });
  });

  it('reads server messages', () => {
    expect(parseServerMessage({ type: 'tick' })).toEqual({ type: 'tick' });
    expect(parseServerMessage({ type: 'error', code: 'FORBIDDEN', extra: 1 })).toEqual({
      type: 'error',
      code: 'FORBIDDEN',
    });
    expect(parseServerMessage({ type: 'error', code: 'NOPE' })).toBeNull();
    expect(parseServerMessage({ type: 1 })).toBeNull();
    expect(parseServerMessage([])).toBeNull();
    expect(parseServerMessage(null)).toBeNull();
  });

  it('reads create and join responses strictly', () => {
    expect(
      parseCreateSessionResponse({
        sessionId: 's',
        participantToken: 'p',
        animationToken: 'a',
        x: 1,
      }),
    ).toEqual({
      sessionId: 's',
      participantToken: 'p',
      animationToken: 'a',
    });
    expect(() => parseCreateSessionResponse({ sessionId: 's' })).toThrow('unexpected shape');
    expect(parseJoinSessionResponse({ participantToken: 'p' })).toEqual({ participantToken: 'p' });
    expect(() => parseJoinSessionResponse({ participantToken: '' })).toThrow('unexpected shape');
  });

  it('reads problems', () => {
    expect(parseProblem({ title: 't', status: 400, detail: 'd' })).toEqual({
      title: 't',
      status: 400,
      detail: 'd',
    });
    expect(parseProblem({ title: 't', status: 400 })).toBeNull();
    expect(parseProblem('x')).toBeNull();
  });

  it('recognises a 22-character base64url session id', () => {
    expect(isSessionId('k3Jx9QvT2mLpZ8wR4nYb7A')).toBe(true);
    expect(isSessionId('court')).toBe(false);
  });
});

describe('contract: sessionState and error with a feature', () => {
  it('reads a sessionState as a server message', async () => {
    const { state } = await import('../testing/fixtures');
    const message = parseServerMessage(JSON.parse(JSON.stringify(state())));
    expect(message?.type).toBe('sessionState');
    expect(parseServerMessage({ ...JSON.parse(JSON.stringify(state())), version: 'x' })).toBeNull();
  });

  it('reads the feature of a stale version error', () => {
    expect(parseServerMessage({ type: 'error', code: 'STALE_VERSION', featureId: 'f1' })).toEqual({
      type: 'error',
      code: 'STALE_VERSION',
      featureId: 'f1',
    });
    expect(parseServerMessage({ type: 'error', code: 'STALE_VERSION', featureId: 7 })).toEqual({
      type: 'error',
      code: 'STALE_VERSION',
    });
  });
});

describe('import and scale messages', () => {
  const preview = {
    previewId: '6f1c2b0a-3d4e-4f5a-9b8c-7d6e5f4a3b2c',
    sourceType: 'XLSX',
    expiresAt: '2026-10-11T14:15:00Z',
    validRows: [
      { line: 2, externalId: 'F-1', title: 'Paiement', description: null, criteria: { bv: 8 } },
    ],
    rejectedRows: [{ line: 4, externalId: null, reason: 'Identifiant vide' }],
    warnings: [{ line: 3, message: 'BV = 12 hors échelle : valeur ignorée' }],
    ignoredColumns: ['Priorité'],
  };

  it('reads an error SCALE_IMPACT with its impacted values', () => {
    const impactedValues = [{ externalId: 'F-1', criterion: 'js', value: 4 }];
    expect(parseServerMessage({ type: 'error', code: 'SCALE_IMPACT', impactedValues })).toEqual({
      type: 'error',
      code: 'SCALE_IMPACT',
      impactedValues,
    });
    expect(
      parseServerMessage({ type: 'error', code: 'SCALE_IMPACT', impactedValues: [{ value: 'x' }] }),
    ).toEqual({ type: 'error', code: 'SCALE_IMPACT' });
  });

  it('reads an import preview and refuses one out of contract', () => {
    expect(parseImportPreview(preview)).toEqual(preview);
    expect(parseImportPreview({ ...preview, scale: { type: 'FIBONACCI', max: 20 } }).scale).toEqual(
      { type: 'FIBONACCI', max: 20 },
    );
    expect(() => parseImportPreview({ ...preview, sourceType: 'PDF' })).toThrow();
    expect(() => parseImportPreview({ ...preview, scale: { type: 'LOG', max: 2 } })).toThrow();
    expect(() =>
      parseImportPreview({
        ...preview,
        validRows: [{ ...preview.validRows[0], criteria: { bv: 'x' } }],
      }),
    ).toThrow();
    expect(() => parseImportPreview({ ...preview, rejectedRows: [{ line: 1 }] })).toThrow();
    expect(() => parseImportPreview({ ...preview, warnings: [{ line: 'a' }] })).toThrow();
    expect(() => parseImportPreview({ ...preview, ignoredColumns: [1] })).toThrow();
    expect(() => parseImportPreview(null)).toThrow();
  });

  it('reads an import result', () => {
    expect(parseImportResult({ imported: 18, rejected: 2 })).toEqual({ imported: 18, rejected: 2 });
    expect(() => parseImportResult({ imported: '18' })).toThrow();
  });
});

describe('contract: session list', () => {
  const line = {
    sessionId: 'k3Jx9QvT2mLpZ8wR4nYb7A',
    name: 'Atelier Q4',
    facilitatorPseudo: 'Éric',
    createdAt: '2026-10-12T09:00:00Z',
    status: 'PREPARATION',
    method: 'WSJF',
    methodVersion: 2,
  };

  it('reads the lines of the session list and keeps only the fields of the contract', () => {
    expect(parseSessionSummaries([{ ...line, extra: 1 }])).toEqual([line]);
    expect(parseSessionSummaries([])).toEqual([]);
  });

  it('refuses a list out of contract', () => {
    for (const bad of [
      {},
      [{ ...line, sessionId: 'x' }],
      [{ ...line, status: 'ARCHIVED' }],
      [{ ...line, createdAt: 'hier' }],
      [{ ...line, methodVersion: '2' }],
    ]) {
      expect(() => parseSessionSummaries(bad)).toThrow();
    }
  });
});

describe('contract: rankingRoom', () => {
  const room = {
    type: 'rankingRoom',
    active: true,
    facilitatorId: 'p1',
    live: true,
    draft: {
      criterionKeys: ['bv'],
      criterionKey: 'bv',
      levels: [['f1']],
      unranked: ['f2'],
      values: { f1: 8 },
    },
    opinions: [
      {
        featureId: 'f1',
        criterionKey: 'bv',
        participantId: 'p2',
        opinion: 'RAISE',
        comment: 'Urgent',
      },
    ],
    spotlightFeatureId: null,
    discussed: [],
  };

  it('reads an open room and a closed one', () => {
    expect(parseServerMessage(room)).toEqual(room);
    expect(isRankingRoom(parseServerMessage(room)!)).toBe(true);
    expect(parseServerMessage({ type: 'rankingRoom', active: false, endReason: 'SAVED' })).toEqual({
      type: 'rankingRoom',
      active: false,
      endReason: 'SAVED',
    });
  });

  it('refuses a room out of contract', () => {
    expect(
      parseServerMessage({ type: 'rankingRoom', active: false, endReason: 'LOST' }),
    ).toBeNull();
    expect(parseServerMessage({ ...room, live: 'yes' })).toBeNull();
    expect(parseServerMessage({ ...room, spotlightFeatureId: 3 })).toBeNull();
    expect(parseServerMessage({ ...room, discussed: undefined })).toBeNull();
    expect(parseServerMessage({ ...room, discussed: [{ featureId: 'f1' }] })).toBeNull();
    expect(parseServerMessage({ ...room, draft: { ...room.draft, levels: [[1]] } })).toBeNull();
    expect(
      parseServerMessage({ ...room, opinions: [{ ...room.opinions[0], opinion: 'QUESTION' }] }),
    ).toBeNull();
  });
});
