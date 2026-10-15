import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { APP_CONFIG } from '../config/app-config';
import { FETCH, SessionApi, SessionApiError } from './session-api';

const ID = 'k3Jx9QvT2mLpZ8wR4nYb7A';

function apiWith(fetchFn: typeof fetch): SessionApi {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'https://api.example' } },
      { provide: FETCH, useValue: fetchFn },
    ],
  });
  return TestBed.inject(SessionApi);
}

const json = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

async function kindOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (e) {
    return e instanceof SessionApiError ? e.kind : 'other';
  }
  return undefined;
}

describe('SessionApi', () => {
  it('creates a session', async () => {
    const fetchFn = json(201, { sessionId: ID, participantToken: 'p', animationToken: 'a' });
    const created = await apiWith(fetchFn).createSession({ name: 'S', pseudo: 'Eric' });
    expect(created.animationToken).toBe('a');
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.example/api/sessions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'S', pseudo: 'Eric' });
  });

  it('maps statuses to typed errors, with the French detail', async () => {
    const problem = { title: 't', status: 400, detail: 'Pseudo invalide' };
    const api = apiWith(json(400, problem));
    await expect(api.createSession({ name: 'S', pseudo: '' })).rejects.toMatchObject({
      kind: 'invalid',
      detail: 'Pseudo invalide',
    });
    expect(await kindOf(apiWith(json(429, {})).createSession({ name: 'S', pseudo: 'E' }))).toBe(
      'tooManyRequests',
    );
    expect(await kindOf(apiWith(json(500, {})).createSession({ name: 'S', pseudo: 'E' }))).toBe(
      'network',
    );
  });

  it('rejects a malformed 201', async () => {
    expect(
      await kindOf(apiWith(json(201, { sessionId: 1 })).createSession({ name: 'S', pseudo: 'E' })),
    ).toBe('network');
  });

  it('turns a network failure or an unreadable error body into typed errors', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    expect(await kindOf(apiWith(failing).checkSession(ID))).toBe('network');
    const empty = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    await expect(apiWith(empty).checkSession(ID)).rejects.toMatchObject({
      kind: 'notFound',
      detail: null,
    });
  });

  it('checks a session and refuses a malformed id without calling the server', async () => {
    const ok = json(200, {});
    await expect(apiWith(ok).checkSession(ID)).resolves.toBeUndefined();
    const never = vi.fn() as unknown as typeof fetch;
    expect(await kindOf(apiWith(never).checkSession('x'))).toBe('notFound');
    expect(never).not.toHaveBeenCalled();
  });

  it('joins a session', async () => {
    const api = apiWith(json(201, { participantToken: 'p' }));
    await expect(api.joinSession(ID, { pseudo: 'Eric' })).resolves.toEqual({
      participantToken: 'p',
    });
    expect(await kindOf(apiWith(json(409, {})).joinSession(ID, { pseudo: 'Eric' }))).toBe(
      'pseudoTaken',
    );
    expect(await kindOf(apiWith(json(201, {})).joinSession(ID, { pseudo: 'Eric' }))).toBe(
      'network',
    );
  });

  it('lists the methods', async () => {
    const { WSJF } = await import('../testing/fixtures');
    const fetchFn = json(200, [JSON.parse(JSON.stringify(WSJF))]);
    const methods = await apiWith(fetchFn).listMethods();
    expect(methods).toEqual([WSJF]);
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
      'https://api.example/api/methods',
    );
  });

  it('refuses a method list that breaks the contract or an error status', async () => {
    expect(await kindOf(apiWith(json(200, [{ key: 'x' }])).listMethods())).toBe('network');
    expect(await kindOf(apiWith(json(200, [])).listMethods())).toBe('network');
    expect(await kindOf(apiWith(json(500, {})).listMethods())).toBe('network');
    const unreadable = vi.fn(
      async () => new Response('nope', { status: 200 }),
    ) as unknown as typeof fetch;
    expect(await kindOf(apiWith(unreadable).listMethods())).toBe('network');
  });
});

describe('SessionApi imports', () => {
  const tokens = { participantToken: 'p-token', animationToken: 'a-token' };
  const preview = {
    previewId: 'id-1',
    sourceType: 'CSV',
    expiresAt: '2026-10-11T14:15:00Z',
    validRows: [],
    rejectedRows: [],
    warnings: [],
    ignoredColumns: [],
  };

  it('sends the file as multipart with the facilitator tokens in headers', async () => {
    const fetchFn = json(200, preview);
    const file = new Blob(['Identifiant;Titre\n'], { type: 'text/csv' });

    const result = await apiWith(fetchFn).previewImport(ID, file, 'a.csv', tokens);

    expect(result.previewId).toBe('id-1');
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`https://api.example/api/sessions/${ID}/imports`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'X-Participant-Token': 'p-token',
      'X-Animation-Token': 'a-token',
    });
    expect((init.body as FormData).get('file')).toBeInstanceOf(Blob);
    expect(String(url)).not.toContain('token');
  });

  it('maps the import statuses to typed errors, with the French reason of a refused file', async () => {
    const problem = { title: 'Fichier refusé', status: 400, detail: 'Sans colonne Titre' };
    const file = new Blob(['x']);
    await expect(
      apiWith(json(400, problem)).previewImport(ID, file, 'a.csv', tokens),
    ).rejects.toMatchObject({ kind: 'invalid', detail: 'Sans colonne Titre' });
    expect(await kindOf(apiWith(json(403, {})).previewImport(ID, file, 'a.csv', tokens))).toBe(
      'forbidden',
    );
    expect(await kindOf(apiWith(json(413, {})).previewImport(ID, file, 'a.csv', tokens))).toBe(
      'tooLarge',
    );
    expect(
      await kindOf(apiWith(json(200, { previewId: 1 })).previewImport(ID, file, 'a.csv', tokens)),
    ).toBe('network');
    expect(await kindOf(apiWith(json(200, {})).previewImport('court', file, 'a.csv', tokens))).toBe(
      'notFound',
    );
  });

  it('confirms a preview and reports an expired one as notFound', async () => {
    const fetchFn = json(200, { imported: 18, rejected: 2 });
    expect(await apiWith(fetchFn).confirmImport(ID, 'id-1', tokens)).toEqual({
      imported: 18,
      rejected: 2,
    });
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`https://api.example/api/sessions/${ID}/imports/id-1/confirm`);
    expect(init.headers['X-Animation-Token']).toBe('a-token');
    expect(await kindOf(apiWith(json(404, {})).confirmImport(ID, 'id-1', tokens))).toBe('notFound');
  });

  it('gives the template address of a method', () => {
    expect(apiWith(json(200, {})).templateUrl('WSJF', 2)).toBe(
      'https://api.example/api/import-template.xlsx?method=WSJF&methodVersion=2',
    );
  });
});
