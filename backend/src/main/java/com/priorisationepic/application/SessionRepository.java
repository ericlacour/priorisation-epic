package com.priorisationepic.application;

import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.scale.Scale;
import java.util.Optional;

/** Accès aux sessions. */
public interface SessionRepository {

  boolean exists(SessionId sessionId);

  /** Vrai si l'empreinte du jeton d'animation de la session est celle de {@code animationToken}. */
  boolean animationTokenMatches(SessionId sessionId, String animationToken);

  /** Enregistre une nouvelle session avec l'empreinte de son jeton d'animation. */
  void insert(Session session, String animationTokenHash);

  Optional<Session> find(SessionId sessionId);

  /** Incrémente le compteur de changements de la session ({@code sessionState.version}). */
  void incrementVersion(SessionId sessionId);

  /** Enregistre le nom et l'échelle de la session (sans changer son compteur). */
  void updateSettings(SessionId sessionId, String name, Scale scale);
}
