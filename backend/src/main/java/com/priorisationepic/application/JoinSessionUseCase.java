package com.priorisationepic.application;

import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.Role;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.Tokens;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

/**
 * Arrivée d'un participant dans une session (FR-002, FR-003). Le pseudo est unique dans la session,
 * sans tenir compte de la casse. Un pseudo déjà pris est refusé, sauf si son propriétaire est
 * absent depuis assez longtemps (aucune connexion ouverte et {@code lastSeenAt} ancien) : le nouvel
 * arrivant reprend alors <b>ce</b> participant, avec ses votes, et un nouveau jeton remplace
 * l'ancien. Le rôle d'animateur ne se reprend jamais par le pseudo : seul le lien d'animation le
 * donne.
 */
public class JoinSessionUseCase {

  /** Demande d'arrivée. {@code businessRole} : rôle métier facultatif. */
  public record Command(String pseudo, String businessRole) {}

  /** Issue d'une arrivée. */
  public sealed interface Result {

    /** Le participant a rejoint la session (ou repris son pseudo) ; jeton à ne pas conserver. */
    record Joined(String participantToken, boolean reclaimed) implements Result {

      /** Jamais le jeton dans un journal. */
      @Override
      public String toString() {
        return "Joined[reclaimed=" + reclaimed + "]";
      }
    }

    /** Session inconnue. */
    record SessionNotFound() implements Result {}

    /** Pseudo déjà utilisé, et pas reprenable. */
    record PseudoTaken() implements Result {}
  }

  private final SessionRepository sessions;
  private final ParticipantRepository participants;
  private final Broadcaster broadcaster;
  private final SessionLocks locks;
  private final Transactions transactions;
  private final ClockPort clock;
  private final IdGenerator ids;
  private final Duration absenceTimeout;

  public JoinSessionUseCase(
      SessionRepository sessions,
      ParticipantRepository participants,
      Broadcaster broadcaster,
      SessionLocks locks,
      Transactions transactions,
      ClockPort clock,
      IdGenerator ids,
      Duration absenceTimeout) {
    this.sessions = sessions;
    this.participants = participants;
    this.broadcaster = broadcaster;
    this.locks = locks;
    this.transactions = transactions;
    this.clock = clock;
    this.ids = ids;
    this.absenceTimeout = absenceTimeout;
  }

  /**
   * @throws com.priorisationepic.domain.InvalidPseudoException pseudo vide ou de plus de 40
   *     caractères
   * @throws com.priorisationepic.domain.InvalidParticipantException rôle métier de plus de 40
   *     caractères
   */
  public Result join(SessionId sessionId, Command command) {
    Pseudo pseudo = Pseudo.of(command.pseudo());
    String businessRole = Participant.businessRoleOf(command.businessRole());
    Result result = locks.withLock(sessionId, () -> joinLocked(sessionId, pseudo, businessRole));
    if (result instanceof Result.Joined) {
      broadcaster.publish(sessionId);
    }
    return result;
  }

  private Result joinLocked(SessionId sessionId, Pseudo pseudo, String businessRole) {
    if (!sessions.exists(sessionId)) {
      return new Result.SessionNotFound();
    }
    Instant now = clock.now();
    String token = ids.newToken();
    Optional<Participant> existing = participants.findByPseudo(sessionId, pseudo);
    if (existing.isEmpty()) {
      Participant joined =
          Participant.join(
                  ids.newUuid(), sessionId, pseudo, Role.PARTICIPANT, Tokens.hash(token), now)
              .withBusinessRole(businessRole);
      transactions.inTransaction(
          () -> {
            participants.insert(joined);
            sessions.bumpVersion(sessionId);
            return null;
          });
      return new Result.Joined(token, false);
    }
    Participant owner = existing.get();
    if (!owner.canBeReclaimed(now, absenceTimeout)
        || broadcaster.hasConnection(sessionId, owner.id())) {
      return new Result.PseudoTaken();
    }
    Participant reclaimed = owner.reclaim(Tokens.hash(token), now);
    transactions.inTransaction(
        () -> {
          participants.updateToken(reclaimed);
          sessions.bumpVersion(sessionId);
          return null;
        });
    return new Result.Joined(token, true);
  }
}
