package com.priorisationepic.application;

import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.SessionStatus;
import com.priorisationepic.domain.scale.Scale;
import java.util.List;
import java.util.Optional;

/** Accès aux sessions. */
public interface SessionRepository {

  boolean exists(SessionId sessionId);

  /** Vrai si l'empreinte du jeton d'animation de la session est celle de {@code animationToken}. */
  boolean animationTokenMatches(SessionId sessionId, String animationToken);

  /**
   * Enregistre une nouvelle session avec l'empreinte de son jeton d'animation.
   *
   * @throws SessionNameTakenException si une autre session a pris ce nom entre-temps (index unique)
   */
  void insert(Session session, String animationTokenHash);

  /** La session dont le nom a cette {@linkplain Session#nameKey(String) clé}, s'il y en a une. */
  Optional<SessionId> findIdByNameKey(String nameKey);

  Optional<Session> find(SessionId sessionId);

  /** Incrémente le compteur de changements de la session ({@code sessionState.version}). */
  void incrementVersion(SessionId sessionId);

  /**
   * Enregistre le nom et l'échelle de la session (sans changer son compteur).
   *
   * @throws SessionNameTakenException si une autre session porte déjà ce nom (index unique)
   */
  void updateSettings(SessionId sessionId, String name, Scale scale);

  /** Enregistre le statut de la session (sans changer son compteur). */
  void updateStatus(SessionId sessionId, SessionStatus status);

  /** Toutes les sessions, de la plus récente à la plus ancienne (FR-026). */
  List<SessionSummary> listSummaries();
}
