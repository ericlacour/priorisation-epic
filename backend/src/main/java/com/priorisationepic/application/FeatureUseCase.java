package com.priorisationepic.application;

import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.InvalidFeatureException;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.method.Criteria;
import com.priorisationepic.domain.method.InvalidValueException;
import com.priorisationepic.domain.method.MethodDefinition;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.method.UnknownCriterionException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Ajout, modification et suppression des fonctionnalités, réservés à l'animateur (FR-006, FR-015).
 * Chaque intention est traitée sous le verrou de la session : charger, appliquer la règle,
 * enregistrer (une seule transaction), puis diffuser. Une intention refusée ne change rien. La
 * modification et la suppression portent la {@code version} lue : une version périmée est refusée
 * ({@code STALE_VERSION}), jamais écrasée en silence. Seul un changement réel d'une valeur de
 * critère laisse une trace dans l'historique.
 */
public class FeatureUseCase {

  public record Add(
      String externalId, String title, String description, Map<String, Integer> criteria) {}

  public record Update(
      UUID featureId,
      long version,
      Change<String> externalId,
      Change<String> title,
      Change<String> description,
      Change<Map<String, Integer>> criteria,
      Change<Boolean> markedForReview,
      Change<String> reviewReason) {}

  public record Delete(UUID featureId, long version) {}

  private final SessionRepository sessions;
  private final ParticipantRepository participants;
  private final FeatureRepository features;
  private final RoundRepository rounds;
  private final ChangeLogWriter changeLog;
  private final Broadcaster broadcaster;
  private final SessionLocks locks;
  private final Transactions transactions;
  private final ClockPort clock;
  private final IdGenerator ids;
  private final MethodRegistry registry;

  public FeatureUseCase(
      SessionRepository sessions,
      ParticipantRepository participants,
      FeatureRepository features,
      RoundRepository rounds,
      ChangeLogWriter changeLog,
      Broadcaster broadcaster,
      SessionLocks locks,
      Transactions transactions,
      ClockPort clock,
      IdGenerator ids,
      MethodRegistry registry) {
    this.sessions = sessions;
    this.participants = participants;
    this.features = features;
    this.rounds = rounds;
    this.changeLog = changeLog;
    this.broadcaster = broadcaster;
    this.locks = locks;
    this.transactions = transactions;
    this.clock = clock;
    this.ids = ids;
    this.registry = registry;
  }

  public Outcome add(SessionId sessionId, Actor actor, Add command) {
    return run(sessionId, actor, session -> addLocked(session, command));
  }

  public Outcome update(SessionId sessionId, Actor actor, Update command) {
    return run(sessionId, actor, session -> updateLocked(session, actor, command));
  }

  public Outcome delete(SessionId sessionId, Actor actor, Delete command) {
    return run(sessionId, actor, session -> deleteLocked(session, command));
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
                return reject(ErrorCode.FORBIDDEN, null);
              }
              if (session.get().isClosed()) {
                return reject(ErrorCode.SESSION_CLOSED, null);
              }
              try {
                return action.apply(session.get());
              } catch (UnknownCriterionException e) {
                return reject(ErrorCode.UNKNOWN_CRITERION, null);
              } catch (InvalidValueException e) {
                return reject(ErrorCode.INVALID_VALUE, null);
              } catch (InvalidFeatureException e) {
                return reject(ErrorCode.INVALID_MESSAGE, null);
              } catch (StaleWriteException e) {
                return reject(ErrorCode.STALE_VERSION, null);
              }
            });
    if (outcome instanceof Outcome.Accepted accepted && accepted.changed()) {
      broadcaster.publish(sessionId);
    }
    return outcome;
  }

  private Outcome addLocked(Session session, Add command) {
    MethodDefinition definition = definitionOf(session);
    UUID id = ids.newUuid();
    Criteria none = Criteria.empty(definition);
    Feature created =
        Feature.create(
            id,
            session.sessionId(),
            command.externalId(),
            command.title(),
            command.description(),
            none,
            session.scale());
    if (command.criteria() != null && !command.criteria().isEmpty()) {
      created = created.withCriteriaChanges(command.criteria(), session.scale());
    }
    if (features.externalKeyTaken(session.sessionId(), created.externalKey(), id)) {
      return reject(ErrorCode.DUPLICATE_EXTERNAL_ID, null);
    }
    Feature toInsert = created;
    transactions.inTransaction(
        () -> {
          features.insert(toInsert);
          sessions.bumpVersion(session.sessionId());
          return null;
        });
    return Outcome.CHANGED;
  }

  private Outcome updateLocked(Session session, Actor actor, Update command) {
    MethodDefinition definition = definitionOf(session);
    Optional<Feature> found =
        features.findActive(session.sessionId(), command.featureId(), definition);
    if (found.isEmpty() || found.get().version() != command.version()) {
      return reject(ErrorCode.STALE_VERSION, command.featureId());
    }
    Feature before = found.get();
    Feature after = before;
    boolean changesCriteria =
        command.criteria().present()
            && command.criteria().value() != null
            && !command.criteria().value().isEmpty();
    if (changesCriteria && inOpenRound(session, command.featureId())) {
      return reject(ErrorCode.FEATURE_IN_OPEN_ROUND, command.featureId());
    }
    if (command.externalId().present()) {
      Feature renamed = after.withExternalId(command.externalId().value());
      if (!renamed.externalKey().equals(before.externalKey())
          && features.externalKeyTaken(session.sessionId(), renamed.externalKey(), before.id())) {
        return reject(ErrorCode.DUPLICATE_EXTERNAL_ID, command.featureId());
      }
      after = renamed;
    }
    if (command.title().present() || command.description().present()) {
      after =
          after.withDetails(
              command.title().present() ? command.title().value() : after.title(),
              command.description().present()
                  ? command.description().value()
                  : after.description());
    }
    Map<String, Integer> changes = Map.of();
    if (command.criteria().present() && command.criteria().value() != null) {
      changes = new LinkedHashMap<>(command.criteria().value());
      after = after.withCriteriaChanges(changes, session.scale());
    }
    boolean reasonWithoutMark =
        command.reviewReason().present()
            && !command.markedForReview().present()
            && !before.markedForReview();
    if (reasonWithoutMark) {
      return reject(ErrorCode.INVALID_MESSAGE, command.featureId());
    }
    if (command.markedForReview().present()) {
      after =
          Boolean.TRUE.equals(command.markedForReview().value())
              ? after.markForReview(
                  command.reviewReason().present()
                      ? command.reviewReason().value()
                      : before.reviewReason())
              : after.clearReview();
    } else if (command.reviewReason().present()) {
      after = after.markForReview(command.reviewReason().value());
    }
    if (after.equals(before)) {
      return Outcome.UNCHANGED;
    }
    Feature toSave = after;
    Map<String, Integer> criteriaChanges = changes;
    Pseudo author = participants.find(actor.participantId()).orElseThrow().pseudo();
    transactions.inTransaction(
        () -> {
          features.update(toSave);
          for (String key : criteriaChanges.keySet()) {
            changeLog.valueChanged(
                session.sessionId(),
                author,
                toSave.id(),
                key,
                before.criteria().value(key).isPresent()
                    ? before.criteria().value(key).getAsInt()
                    : null,
                toSave.criteria().value(key).isPresent()
                    ? toSave.criteria().value(key).getAsInt()
                    : null);
          }
          sessions.bumpVersion(session.sessionId());
          return null;
        });
    return Outcome.CHANGED;
  }

  private Outcome deleteLocked(Session session, Delete command) {
    MethodDefinition definition = definitionOf(session);
    Optional<Feature> found =
        features.findActive(session.sessionId(), command.featureId(), definition);
    if (found.isEmpty()) {
      return Outcome.UNCHANGED;
    }
    if (found.get().version() != command.version()) {
      return reject(ErrorCode.STALE_VERSION, command.featureId());
    }
    if (inOpenRound(session, command.featureId())) {
      return reject(ErrorCode.FEATURE_IN_OPEN_ROUND, command.featureId());
    }
    transactions.inTransaction(
        () -> {
          features.softDelete(command.featureId(), clock.now(), command.version());
          sessions.bumpVersion(session.sessionId());
          return null;
        });
    return Outcome.CHANGED;
  }

  /**
   * Une fonctionnalité d'un tour ouvert garde ses valeurs retenues jusqu'à la révélation (FR-018).
   */
  private boolean inOpenRound(Session session, UUID featureId) {
    return rounds.featuresInOpenRounds(session.sessionId()).contains(featureId);
  }

  private MethodDefinition definitionOf(Session session) {
    return session.prioritizationMethod(registry).definition();
  }

  private static Outcome reject(ErrorCode code, UUID featureId) {
    return new Outcome.Rejected(code, featureId);
  }
}
