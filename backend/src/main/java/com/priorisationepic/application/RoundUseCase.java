package com.priorisationepic.application;

import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.method.MethodDefinition;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.round.InvalidRoundException;
import com.priorisationepic.domain.round.VotingRound;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Ouverture et révélation des tours de vote, réservées à l'animateur (FR-018, FR-020, FR-022), sous
 * le verrou de la session. Un tour ne s'ouvre qu'en cours de session ; une fonctionnalité n'est que
 * dans un seul tour ouvert à la fois ; la révélation porte sur toutes les fonctionnalités du tour
 * et retire leur marque « à revoir » (FR-006a).
 */
public class RoundUseCase {

  /** {@code previousRoundId} est nul pour un premier tour, ou celui d'un tour relancé (FR-022). */
  public record Open(List<UUID> featureIds, UUID previousRoundId) {}

  private final SessionRepository sessions;
  private final FeatureRepository features;
  private final RoundRepository rounds;
  private final Broadcaster broadcaster;
  private final SessionLocks locks;
  private final Transactions transactions;
  private final ClockPort clock;
  private final IdGenerator ids;
  private final MethodRegistry registry;

  public RoundUseCase(
      SessionRepository sessions,
      FeatureRepository features,
      RoundRepository rounds,
      Broadcaster broadcaster,
      SessionLocks locks,
      Transactions transactions,
      ClockPort clock,
      IdGenerator ids,
      MethodRegistry registry) {
    this.sessions = sessions;
    this.features = features;
    this.rounds = rounds;
    this.broadcaster = broadcaster;
    this.locks = locks;
    this.transactions = transactions;
    this.clock = clock;
    this.ids = ids;
    this.registry = registry;
  }

  public Outcome open(SessionId sessionId, Actor actor, Open command) {
    return run(sessionId, actor, session -> openLocked(session, command));
  }

  public Outcome reveal(SessionId sessionId, Actor actor, UUID roundId) {
    return run(sessionId, actor, session -> revealLocked(session, roundId));
  }

  private interface Action {
    Outcome apply(Session session);
  }

  private Outcome run(SessionId sessionId, Actor actor, Action action) {
    Outcome outcome =
        locks.withLock(
            sessionId,
            () -> {
              Optional<Session> session = sessions.find(sessionId);
              if (session.isEmpty() || !actor.facilitator()) {
                return Outcome.Rejected.of(ErrorCode.FORBIDDEN);
              }
              if (session.get().isClosed()) {
                return Outcome.Rejected.of(ErrorCode.SESSION_CLOSED);
              }
              try {
                return action.apply(session.get());
              } catch (InvalidRoundException e) {
                return Outcome.Rejected.of(ErrorCode.INVALID_MESSAGE);
              } catch (StaleWriteException e) {
                return Outcome.Rejected.of(ErrorCode.STALE_VERSION);
              }
            });
    if (outcome instanceof Outcome.Accepted accepted && accepted.changed()) {
      broadcaster.publish(sessionId);
    }
    return outcome;
  }

  private Outcome openLocked(Session session, Open command) {
    if (!session.canOpenRound()) {
      return Outcome.Rejected.of(ErrorCode.SESSION_NOT_STARTED);
    }
    SessionId sessionId = session.sessionId();
    MethodDefinition definition = session.prioritizationMethod(registry).definition();
    List<UUID> selection = command.featureIds();
    Set<UUID> busy = rounds.featuresInOpenRounds(sessionId);
    for (UUID featureId : selection) {
      if (features.findActive(sessionId, featureId, definition).isEmpty()) {
        return Outcome.Rejected.of(ErrorCode.INVALID_MESSAGE);
      }
      if (busy.contains(featureId)) {
        return new Outcome.Rejected(ErrorCode.FEATURE_IN_OPEN_ROUND, featureId);
      }
    }
    if (command.previousRoundId() != null) {
      Optional<VotingRound> previous = rounds.find(sessionId, command.previousRoundId());
      if (previous.isEmpty()
          || previous.get().isOpen()
          || !previous.get().featureIds().containsAll(selection)) {
        return Outcome.Rejected.of(ErrorCode.INVALID_MESSAGE);
      }
    }
    VotingRound round =
        VotingRound.open(
            ids.newUuid(),
            sessionId,
            rounds.nextNumber(sessionId),
            selection,
            command.previousRoundId(),
            clock.now());
    transactions.inTransaction(
        () -> {
          rounds.insert(round);
          sessions.bumpVersion(sessionId);
          return null;
        });
    return Outcome.CHANGED;
  }

  private Outcome revealLocked(Session session, UUID roundId) {
    SessionId sessionId = session.sessionId();
    Optional<VotingRound> found = rounds.find(sessionId, roundId);
    if (found.isEmpty()) {
      return Outcome.Rejected.of(ErrorCode.INVALID_MESSAGE);
    }
    VotingRound round = found.get();
    if (!round.isOpen()) {
      return Outcome.UNCHANGED;
    }
    MethodDefinition definition = session.prioritizationMethod(registry).definition();
    VotingRound revealed = round.reveal(clock.now());
    transactions.inTransaction(
        () -> {
          rounds.markRevealed(roundId, revealed.revealedAt());
          for (UUID featureId : round.featureIds()) {
            features
                .findActive(sessionId, featureId, definition)
                .filter(Feature::markedForReview)
                .ifPresent(f -> features.update(f.clearReview()));
          }
          sessions.bumpVersion(sessionId);
          return null;
        });
    return Outcome.CHANGED;
  }
}
