package com.priorisationepic.application;

import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.SessionStatus;
import com.priorisationepic.domain.SessionStatus.TransitionRefusedException;

/**
 * Intention {@code changeStatus} (FR-004, FR-026) : démarrer, clôturer et rouvrir la session.
 * Réservée à l'animateur, exécutée sous le verrou de la session. En {@code CLOSED}, seule {@code
 * REOPEN} est acceptée ({@code SESSION_CLOSED} sinon) ; une session en préparation ne se clôture
 * pas ({@code SESSION_NOT_STARTED}). Une action sans effet renvoie l'état, comme une intention
 * traitée.
 */
public class ChangeStatusUseCase {

  private final SessionRepository sessions;
  private final Broadcaster broadcaster;
  private final SessionLocks locks;
  private final Transactions transactions;

  public ChangeStatusUseCase(
      SessionRepository sessions,
      Broadcaster broadcaster,
      SessionLocks locks,
      Transactions transactions) {
    this.sessions = sessions;
    this.broadcaster = broadcaster;
    this.locks = locks;
    this.transactions = transactions;
  }

  public void change(SessionId sessionId, boolean facilitator, SessionStatus.Action action) {
    locks.withLock(
        sessionId,
        () -> {
          if (!facilitator) {
            throw new IntentRejectedException(ErrorCode.FORBIDDEN);
          }
          Session session = sessions.find(sessionId).orElseThrow(SessionNotFoundException::new);
          SessionStatus after = after(session.status(), action);
          if (after != session.status()) {
            transactions.run(
                () -> {
                  sessions.updateStatus(sessionId, after);
                  sessions.incrementVersion(sessionId);
                });
          }
          broadcaster.publish(sessionId);
          return null;
        });
  }

  private static SessionStatus after(SessionStatus status, SessionStatus.Action action) {
    try {
      return status.after(action);
    } catch (TransitionRefusedException e) {
      throw new IntentRejectedException(
          switch (e.reason()) {
            case CLOSED -> ErrorCode.SESSION_CLOSED;
            case NOT_STARTED -> ErrorCode.SESSION_NOT_STARTED;
          });
    }
  }
}
