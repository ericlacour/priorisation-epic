package com.priorisationepic.application;

import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.Tokens;
import java.util.Optional;
import java.util.UUID;

/**
 * Transmission du rôle d'animateur à un participant connecté (FR-002a). Refusée avec {@code
 * PARTICIPANT_OFFLINE} s'il n'a aucune connexion ouverte : il ne pourrait pas recevoir son lien.
 * Sinon l'ancien animateur redevient participant, un nouveau jeton d'animation remplace l'ancien
 * (dont seule l'empreinte était gardée), il n'est envoyé qu'aux connexions du bénéficiaire ({@code
 * facilitatorHandover}), puis l'état est diffusé à tous.
 */
public class TransferFacilitatorUseCase {

  private final SessionRepository sessions;
  private final ParticipantRepository participants;
  private final Broadcaster broadcaster;
  private final SessionLocks locks;
  private final Transactions transactions;
  private final IdGenerator ids;
  private final FacilitatorRoles roles;

  public TransferFacilitatorUseCase(
      SessionRepository sessions,
      ParticipantRepository participants,
      Broadcaster broadcaster,
      SessionLocks locks,
      Transactions transactions,
      IdGenerator ids) {
    this.sessions = sessions;
    this.participants = participants;
    this.broadcaster = broadcaster;
    this.locks = locks;
    this.transactions = transactions;
    this.ids = ids;
    this.roles = new FacilitatorRoles(participants, sessions, transactions, broadcaster);
  }

  public Outcome transfer(SessionId sessionId, Actor actor, UUID target) {
    return locks.withLock(sessionId, () -> transferLocked(sessionId, actor, target));
  }

  private Outcome transferLocked(SessionId sessionId, Actor actor, UUID target) {
    if (!sessions.exists(sessionId) || !actor.facilitator()) {
      return Outcome.Rejected.of(ErrorCode.FORBIDDEN);
    }
    Optional<Participant> beneficiary =
        participants.find(target).filter(p -> p.sessionId().equals(sessionId));
    if (beneficiary.isEmpty()) {
      return Outcome.Rejected.of(ErrorCode.UNKNOWN_PARTICIPANT);
    }
    if (target.equals(actor.participantId())) {
      return Outcome.UNCHANGED;
    }
    if (!broadcaster.hasConnection(sessionId, target)) {
      return Outcome.Rejected.of(ErrorCode.PARTICIPANT_OFFLINE);
    }
    String token = ids.newToken();
    transactions.inTransaction(
        () -> {
          sessions.updateAnimationTokenHash(sessionId, Tokens.hash(token));
          roles.transferTo(sessionId, target);
          return null;
        });
    broadcaster.sendHandover(sessionId, target, token);
    broadcaster.publish(sessionId);
    return Outcome.CHANGED;
  }
}
