package com.priorisationepic.application;

import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.Tokens;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

/**
 * Arrivée d'un participant (FR-002, FR-003). Un pseudo est unique dans la session sans tenir compte
 * de la casse ; s'il est déjà pris par un participant absent depuis au moins {@code absenceTimeout}
 * (et sans connexion ouverte), le nouvel arrivant est rattaché à ce participant, avec ses votes, et
 * un nouveau jeton remplace l'ancien. Le rôle d'animateur ne se reprend jamais ainsi.
 */
public class JoinSessionUseCase {

  /** Le jeton de participant, rendu une seule fois. */
  public record Joined(String participantToken) {

    @Override
    public String toString() {
      return "Joined[***]";
    }
  }

  private final SessionRepository sessions;
  private final ParticipantRepository participants;
  private final Broadcaster broadcaster;
  private final SessionLocks locks;
  private final IdGenerator ids;
  private final ClockPort clock;
  private final Transactions transactions;
  private final Duration absenceTimeout;

  public JoinSessionUseCase(
      SessionRepository sessions,
      ParticipantRepository participants,
      Broadcaster broadcaster,
      SessionLocks locks,
      IdGenerator ids,
      ClockPort clock,
      Transactions transactions,
      Duration absenceTimeout) {
    this.sessions = sessions;
    this.participants = participants;
    this.broadcaster = broadcaster;
    this.locks = locks;
    this.ids = ids;
    this.clock = clock;
    this.transactions = transactions;
    this.absenceTimeout = absenceTimeout;
  }

  /**
   * @throws SessionNotFoundException session inconnue ou identifiant mal formé
   * @throws com.priorisationepic.domain.InvalidPseudoException pseudo invalide
   * @throws PseudoTakenException pseudo pris par un participant présent ou récemment parti
   */
  public Joined join(String rawSessionId, String rawPseudo, String businessRole) {
    if (!SessionId.isValid(rawSessionId)) {
      throw new SessionNotFoundException();
    }
    SessionId sessionId = new SessionId(rawSessionId);
    Pseudo pseudo = Pseudo.of(rawPseudo);
    String token = ids.newToken();
    String hash = Tokens.hash(token);
    locks.withLock(
        sessionId,
        () -> {
          if (!sessions.exists(sessionId)) {
            throw new SessionNotFoundException();
          }
          Instant now = clock.now();
          Optional<Participant> existing = participants.findByPseudo(sessionId, pseudo);
          if (existing.isPresent()) {
            Participant owner = existing.get();
            if (!owner.isReclaimable(now, absenceTimeout)
                || broadcaster.hasConnection(sessionId, owner.id())) {
              throw new PseudoTakenException();
            }
            transactions.run(() -> participants.replaceToken(owner.id(), hash, now));
          } else {
            Participant arrival =
                Participant.joining(ids.newUuid(), sessionId, pseudo, businessRole, hash, now);
            transactions.run(() -> participants.insert(arrival));
          }
          broadcaster.publish(sessionId);
          return null;
        });
    return new Joined(token);
  }
}
