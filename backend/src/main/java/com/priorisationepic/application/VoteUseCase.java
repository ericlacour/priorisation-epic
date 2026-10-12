package com.priorisationepic.application;

import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.method.InvalidValueException;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.method.UnknownCriterionException;
import com.priorisationepic.domain.round.RoundRevealedException;
import com.priorisationepic.domain.round.Vote;
import com.priorisationepic.domain.round.VotingRound;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Le vote d'un membre sur une fonctionnalité d'un tour ouvert (FR-019), l'animateur compris. Les
 * valeurs remplacent le vote précédent du même membre sur la fonctionnalité ; un critère absent ou
 * nul vaut « sans avis » ; aucune valeur efface le vote. Rien n'est diffusé ni versionné quand le
 * vote ne change pas.
 */
public class VoteUseCase {

  public record Cast(UUID roundId, UUID featureId, Map<String, Integer> criteria) {}

  private final SessionRepository sessions;
  private final RoundRepository rounds;
  private final Broadcaster broadcaster;
  private final SessionLocks locks;
  private final Transactions transactions;
  private final ClockPort clock;
  private final MethodRegistry registry;

  public VoteUseCase(
      SessionRepository sessions,
      RoundRepository rounds,
      Broadcaster broadcaster,
      SessionLocks locks,
      Transactions transactions,
      ClockPort clock,
      MethodRegistry registry) {
    this.sessions = sessions;
    this.rounds = rounds;
    this.broadcaster = broadcaster;
    this.locks = locks;
    this.transactions = transactions;
    this.clock = clock;
    this.registry = registry;
  }

  public Outcome cast(SessionId sessionId, Actor actor, Cast command) {
    Outcome outcome = locks.withLock(sessionId, () -> castLocked(sessionId, actor, command));
    if (outcome instanceof Outcome.Accepted accepted && accepted.changed()) {
      broadcaster.publish(sessionId);
    }
    return outcome;
  }

  private Outcome castLocked(SessionId sessionId, Actor actor, Cast command) {
    Optional<Session> found = sessions.find(sessionId);
    if (found.isEmpty()) {
      return Outcome.Rejected.of(ErrorCode.FORBIDDEN);
    }
    Session session = found.get();
    if (session.isClosed()) {
      return Outcome.Rejected.of(ErrorCode.SESSION_CLOSED);
    }
    Optional<VotingRound> round = rounds.find(sessionId, command.roundId());
    if (round.isEmpty() || !round.get().contains(command.featureId())) {
      return Outcome.Rejected.of(ErrorCode.INVALID_MESSAGE);
    }
    Vote vote;
    try {
      round.get().ensureOpen();
      vote =
          Vote.cast(
              command.roundId(),
              command.featureId(),
              actor.participantId(),
              command.criteria(),
              session.prioritizationMethod(registry).definition(),
              session.scale(),
              clock.now());
    } catch (RoundRevealedException e) {
      return Outcome.Rejected.of(ErrorCode.ROUND_REVEALED);
    } catch (UnknownCriterionException e) {
      return Outcome.Rejected.of(ErrorCode.UNKNOWN_CRITERION);
    } catch (InvalidValueException e) {
      return Outcome.Rejected.of(ErrorCode.INVALID_VALUE);
    }
    Map<String, Integer> current =
        rounds.findVotes(sessionId).stream()
            .filter(
                v ->
                    v.roundId().equals(vote.roundId())
                        && v.featureId().equals(vote.featureId())
                        && v.participantId().equals(vote.participantId()))
            .findFirst()
            .map(Vote::values)
            .orElse(Map.of());
    if (current.equals(vote.values())) {
      return Outcome.UNCHANGED;
    }
    transactions.inTransaction(
        () -> {
          rounds.saveVote(vote);
          sessions.bumpVersion(sessionId);
          return null;
        });
    return Outcome.CHANGED;
  }
}
