package com.priorisationepic.application;

import com.priorisationepic.domain.SessionId;

/** Accès aux sessions. Étendu avec les cas d'usage des parcours. */
public interface SessionRepository {

  boolean exists(SessionId sessionId);

  /** Vrai si l'empreinte du jeton d'animation de la session est celle de {@code animationToken}. */
  boolean animationTokenMatches(SessionId sessionId, String animationToken);
}
