package com.priorisationepic.application;

import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.SessionStatus;
import com.priorisationepic.domain.SessionStatus.TransitionRefusedException;
import java.util.function.Consumer;

/**
 * Intention {@code changeStatus} (FR-004, FR-026) : démarrer, clôturer et rouvrir la session.
 * Réservée à l'animateur, exécutée sous le verrou de la session. En {@code CLOSED}, seule {@code
 * REOPEN} est acceptée ({@code SESSION_CLOSED} sinon) ; une session en préparation ne se clôture
 * pas ({@code SESSION_NOT_STARTED}). Une action sans effet renvoie l'état, comme une intention
 * traitée. Une clôture effective prévient {@code onClosed}, qui ferme la salle de classement en
 * cours (FR-015b).
 */
public class ChangeStatusUseCase {

  private final SessionRepository sessions;
  private final Broadcaster broadcaster;
  private final SessionLocks locks;
  private final Transactions transactions;
  private final Consumer<SessionId> onClosed;

  public ChangeStatusUseCase(
      SessionRepository sessions,
      Broadcaster broadcaster,
      SessionLocks locks,
      Transactions transactions) {
    this(sessions, broadcaster, locks, transactions, sessionId -> {});
  }

  public ChangeStatusUseCase(
      SessionRepository sessions,
      Broadcaster broadcaster,
      SessionLocks locks,
      Transactions transactions,
      Consumer<SessionId> onClosed) {
    this.sessions = sessions;
    this.broadcaster = broadcaster;
    this.locks = locks;
    this.transactions = transactions;
    this.onClosed = onClosed;
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
          if (after == SessionStatus.CLOSED && session.status() != SessionStatus.CLOSED) {
            onClosed.accept(sessionId);
          }
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
