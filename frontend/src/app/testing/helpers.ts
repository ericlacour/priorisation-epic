import { Provider } from '@angular/core';
import { vi } from 'vitest';

import { FETCH } from '../api/session-api';
import { APP_CONFIG } from '../config/app-config';
import { LOCAL_STORAGE } from '../storage/browser-storage';

/** Un `localStorage` en mémoire, pour inspecter ce que l'application range. */
export function memoryStorage(): { data: Map<string, string>; provider: Provider } {
  const data = new Map<string, string>();
  const backing = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  } as Storage;
  return { data, provider: { provide: LOCAL_STORAGE, useValue: () => backing } };
}

/** Réponse JSON d'un faux `fetch`. */
export const reply = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Faux `fetch` : la réponse est choisie par « MÉTHODE chemin ». Un appel non prévu répond 500. */
export function fakeFetch(routes: Record<string, (init?: RequestInit) => Response>) {
  const calls: { key: string; init?: RequestInit }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const key = `${init?.method ?? 'GET'} ${path}`;
    calls.push({ key, init });
    const route = routes[key];
    return route ? route(init) : reply(500, {});
  }) as unknown as typeof fetch;
  return { fn, calls };
}

/** Fournisseurs communs aux specs des pages : configuration, `fetch` et stockage. */
export function pageProviders(fetchFn: typeof fetch, storage: Provider): Provider[] {
  return [
    { provide: APP_CONFIG, useValue: { apiBaseUrl: 'https://api.example' } },
    { provide: FETCH, useValue: fetchFn },
    storage,
  ];
}

/** Laisse les promesses en attente se résoudre et met la vue à jour. */
export async function settle(fixture: {
  detectChanges: () => void;
  whenStable: () => Promise<unknown>;
}): Promise<void> {
  // `Response.json()` se termine sur une tâche, pas sur une microtâche : on laisse passer quelques tours.
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    await fixture.whenStable();
  }
}
