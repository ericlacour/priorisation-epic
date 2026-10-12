package com.priorisationepic.application;

import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.SessionStatus;
import java.util.Optional;

/**
 * Changement de statut de la session par l'animateur (FR-004). {@code START} fait passer la session
 * de « en préparation » à « en cours » ; sur une session déjà en cours, l'intention est satisfaite
 * et ne change rien. {@code CLOSE} et {@code REOPEN} viennent avec la consultation (US5).
 */
public class ChangeStatusUseCase {

  /** Les actions de statut prévues par le contrat. */
  public enum Action {
    START
  }

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

  public Outcome change(SessionId sessionId, Actor actor, Action action) {
    Outcome outcome =
        locks.withLock(
            sessionId,
            () -> {
              Optional<Session> found = sessions.find(sessionId);
              if (found.isEmpty() || !actor.facilitator()) {
                return Outcome.Rejected.of(ErrorCode.FORBIDDEN);
              }
              Session session = found.get();
              return switch (action) {
                case START -> start(session);
              };
            });
    if (outcome instanceof Outcome.Accepted accepted && accepted.changed()) {
      broadcaster.publish(sessionId);
    }
    return outcome;
  }

  private Outcome start(Session session) {
    if (session.status() == SessionStatus.IN_PROGRESS) {
      return Outcome.UNCHANGED;
    }
    if (session.isClosed()) {
      return Outcome.Rejected.of(ErrorCode.SESSION_CLOSED);
    }
    transactions.inTransaction(
        () -> {
          sessions.updateStatus(session.sessionId(), session.start().status());
          sessions.bumpVersion(session.sessionId());
          return null;
        });
    return Outcome.CHANGED;
  }
}
