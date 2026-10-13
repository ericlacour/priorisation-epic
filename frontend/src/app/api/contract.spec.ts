import { describe, expect, it } from 'vitest';

import {
  heartbeatMessage,
  helloMessage,
  isSessionId,
  parseCreateSessionResponse,
  parseJoinSessionResponse,
  parseProblem,
  parseServerMessage,
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
