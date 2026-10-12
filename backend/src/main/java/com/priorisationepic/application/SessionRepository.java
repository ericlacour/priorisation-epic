package com.priorisationepic.application;

import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import java.util.Optional;

/** Accès aux sessions. */
public interface SessionRepository {

  boolean exists(SessionId sessionId);

  /** Vrai si l'empreinte du jeton d'animation de la session est celle de {@code animationToken}. */
  boolean animationTokenMatches(SessionId sessionId, String animationToken);

  Optional<Session> find(SessionId sessionId);

  /** Enregistre une nouvelle session ; sa version vaut 0. */
  void insert(Session session);

  /**
   * Incrémente la version de la session et la renvoie. À appeler dans la transaction de chaque
   * changement accepté : c'est le numéro de version du {@code sessionState} diffusé.
   */
  long bumpVersion(SessionId sessionId);
}
