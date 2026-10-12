package com.priorisationepic.application;

import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.SessionStatus;
import com.priorisationepic.domain.Tokens;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/** Dépôt de sessions en mémoire pour les tests de cas d'usage. */
public final class InMemorySessionRepository implements SessionRepository {

  public final Map<SessionId, Session> sessions = new HashMap<>();

  @Override
  public boolean exists(SessionId sessionId) {
    return sessions.containsKey(sessionId);
  }

  @Override
  public boolean animationTokenMatches(SessionId sessionId, String animationToken) {
    Session session = sessions.get(sessionId);
    return session != null && Tokens.matches(animationToken, session.animationTokenHash());
  }

  @Override
  public Optional<Session> find(SessionId sessionId) {
    return Optional.ofNullable(sessions.get(sessionId));
  }

  @Override
  public void insert(Session session) {
    sessions.put(session.sessionId(), session.withVersion(0));
  }

  @Override
  public long bumpVersion(SessionId sessionId) {
    Session next = sessions.get(sessionId).withVersion(sessions.get(sessionId).version() + 1);
    sessions.put(sessionId, next);
    return next.version();
  }

  @Override
  public void updateStatus(SessionId sessionId, SessionStatus status) {
    Session s = sessions.get(sessionId);
    sessions.put(
        sessionId,
        new Session(
            s.sessionId(),
            s.animationTokenHash(),
            s.name(),
            status,
            s.method(),
            s.methodVersion(),
            s.scale(),
            s.createdAt(),
            s.createdByPseudo(),
            s.version()));
  }

  @Override
  public void updateAnimationTokenHash(SessionId sessionId, String hash) {
    sessions.put(sessionId, sessions.get(sessionId).withAnimationTokenHash(hash));
  }

  /** Remplace une session déjà enregistrée (pour mettre un test dans un statut donné). */
  public void put(Session session) {
    sessions.put(session.sessionId(), session);
  }
}
