import { Injectable, InjectionToken, inject } from '@angular/core';

/**
 * Accès au `localStorage`, `null` s'il est indisponible (navigation privée, stockage bloqué) : l'application
 * fonctionne alors sans préremplissage.
 */
export const LOCAL_STORAGE = new InjectionToken<() => Storage | null>('LOCAL_STORAGE', {
  providedIn: 'root',
  factory: () => () => {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  },
});

const PSEUDO_KEY = 'pe.pseudo';
/** Clé du thème choisi, lue aussi par `main.ts` avant le démarrage d'Angular. */
export const THEME_KEY = 'pe.theme';
/** Aperçu de l'assistant IA affiché (`on`) ou masqué (autre valeur, ou absent). */
const ASSISTANT_KEY = 'pe.assistant';
const tokenKey = (sessionId: string) => `pe.token.${sessionId}`;
const animationKey = (sessionId: string) => `pe.animation.${sessionId}`;

/**
 * Jeton par session (`pe.token.{sessionId}`), jeton d'animation (`pe.animation.{sessionId}`), dernier pseudo (`pe.pseudo`), thème choisi (`pe.theme`) et aperçu de l'assistant IA affiché ou non (`pe.assistant`). Aucune
 * méthode ne lève. Quand le `localStorage` est indisponible ou refuse l'écriture, les valeurs sont gardées en mémoire
 * pour la durée de la page : le jeton obtenu en rejoignant reste ainsi utilisable par la connexion de session.
 */
@Injectable({ providedIn: 'root' })
export class BrowserStorage {
  private readonly storage = inject(LOCAL_STORAGE);
  private readonly fallback = new Map<string, string>();

  readPseudo(): string | null {
    return this.read(PSEUDO_KEY);
  }

  savePseudo(pseudo: string): void {
    this.write(PSEUDO_KEY, pseudo);
  }

  /** Valeur brute de `pe.theme`, à interpréter par `parseTheme`. */
  readTheme(): string | null {
    return this.read(THEME_KEY);
  }

  saveTheme(theme: string): void {
    this.write(THEME_KEY, theme);
  }

  /** L'aperçu de l'assistant IA est-il affiché ? Masqué par défaut. */
  readAssistantShown(): boolean {
    return this.read(ASSISTANT_KEY) === 'on';
  }

  saveAssistantShown(shown: boolean): void {
    this.write(ASSISTANT_KEY, shown ? 'on' : 'off');
  }

  readToken(sessionId: string): string | null {
    return this.read(tokenKey(sessionId));
  }

  saveToken(sessionId: string, token: string): void {
    this.write(tokenKey(sessionId), token);
  }

  /** Jeton d'animation de la session (`pe.animation.{sessionId}`), présent seulement chez l'animateur. */
  readAnimationToken(sessionId: string): string | null {
    return this.read(animationKey(sessionId));
  }

  saveAnimationToken(sessionId: string, token: string): void {
    this.write(animationKey(sessionId), token);
  }

  /** Efface le jeton d'animation d'une session disparue. */
  removeAnimationToken(sessionId: string): void {
    this.remove(animationKey(sessionId));
  }

  /** Efface le jeton d'une session disparue. */
  removeToken(sessionId: string): void {
    this.remove(tokenKey(sessionId));
  }

  private remove(key: string): void {
    this.fallback.delete(key);
    try {
      this.storage()?.removeItem(key);
    } catch {
      // Stockage refusé : rien à effacer.
    }
  }

  private read(key: string): string | null {
    try {
      const stored = this.storage()?.getItem(key) ?? null;
      if (stored !== null) return stored;
    } catch {
      // Stockage refusé : repli en mémoire.
    }
    return this.fallback.get(key) ?? null;
  }

  private write(key: string, value: string): void {
    try {
      const storage = this.storage();
      if (storage) {
        storage.setItem(key, value);
        this.fallback.delete(key);
        return;
      }
    } catch {
      // Stockage plein ou refusé : repli en mémoire.
    }
    this.fallback.set(key, value);
  }
}
