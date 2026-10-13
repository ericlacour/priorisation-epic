import type { Page } from '@playwright/test';

/** Identifiant de session des e2e (22 caractères base64url). */
export const SESSION_ID = 'k3Jx9QvT2mLpZ8wR4nYb7A';

/**
 * Remplace le WebSocket du navigateur par un faux socket que le test pilote : il garde les messages envoyés par
 * l'application (`hello`, `heartbeat`, intentions) et publie ceux que le test lui donne (`sessionState`, `error`).
 * Le webservice et sa base ne sont pas nécessaires.
 */
export async function installFakeSocket(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown> & Window;
    const sent: unknown[] = [];
    const sockets: FakeSocket[] = [];

    class FakeSocket {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
      readyState = 0;
      onopen: ((event: unknown) => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: ((event: { code: number }) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;

      constructor(readonly url: string) {
        sockets.push(this);
        setTimeout(() => {
          this.readyState = 1;
          this.onopen?.({});
        }, 0);
      }

      send(data: string): void {
        sent.push(JSON.parse(data));
      }

      close(): void {
        this.readyState = 3;
      }
    }

    w['WebSocket'] = FakeSocket as unknown as typeof WebSocket;
    w['__sent'] = sent;
    w['__sockets'] = sockets;
    w['__push'] = (message: unknown) => {
      const socket = sockets[sockets.length - 1];
      socket?.onmessage?.({ data: JSON.stringify(message) });
    };
    w['__closeSocket'] = (code: number) => {
      const socket = sockets[sockets.length - 1];
      if (socket) {
        socket.readyState = 3;
        socket.onclose?.({ code });
      }
    };
  });
}

/** Publie un message du serveur dans la page. */
export async function push(page: Page, message: unknown): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __sockets: unknown[] }).__sockets.length > 0,
  );
  await page.evaluate(
    (m) => (window as unknown as { __push: (x: unknown) => void }).__push(m),
    message,
  );
}

/** Les messages envoyés par l'application depuis le début de la page. */
export async function sent(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(() => (window as unknown as { __sent: Record<string, unknown>[] }).__sent);
}

/** Les messages d'un type donné. */
export async function sentOfType(page: Page, type: string): Promise<Record<string, unknown>[]> {
  return (await sent(page)).filter((message) => message['type'] === type);
}

/** Range les jetons dans le `localStorage` avant le chargement de la page. */
export async function storeTokens(page: Page, options: { animate: boolean }): Promise<void> {
  await page.addInitScript(
    ({ id, animate }) => {
      localStorage.setItem(`pe.token.${id}`, 'participant-token');
      if (animate) localStorage.setItem(`pe.animation.${id}`, 'animation-token');
    },
    { id: SESSION_ID, animate: options.animate },
  );
}
