package com.priorisationepic.application;

import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.method.Criteria;
import com.priorisationepic.domain.method.MethodDefinition;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.method.UnknownCriterionException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Intentions {@code addFeature}, {@code updateFeature} et {@code deleteFeature} (FR-006, FR-015) :
 * réservées à l'animateur, exécutées sous le verrou de la session, avec contrôle de la version
 * (jamais d'écrasement silencieux). Les valeurs sont validées contre la définition de la méthode
 * (UNKNOWN_CRITERION), puis contre l'échelle (INVALID_VALUE). Seule la modification de la valeur
 * d'un critère d'une fonctionnalité existante est tracée dans l'historique, dans la même
 * transaction. Un refus ne change rien et lève {@link IntentRejectedException}.
 */
public class FeatureUseCase {

  public record Add(
      String externalId, String title, String description, Map<String, Integer> criteria) {}

  /**
   * Modification partielle : seuls les champs présents changent. Une valeur {@code null} dans
   * {@code criteria} efface le critère.
   */
  public record Update(
      UUID featureId,
      int version,
      Patch<String> externalId,
      Patch<String> title,
      Patch<String> description,
      Map<String, Integer> criteria,
      Patch<Boolean> markedForReview,
      Patch<String> reviewReason) {}

  public record Delete(UUID featureId, int version) {}

  private final SessionRepository sessions;
  private final ParticipantRepository participants;
  private final FeatureRepository features;
  private final ChangeLogWriter changeLog;
  private final MethodRegistry methods;
  private final Broadcaster broadcaster;
  private final SessionLocks locks;
  private final IdGenerator ids;
  private final ClockPort clock;
  private final Transactions transactions;

  public FeatureUseCase(
      SessionRepository sessions,
      ParticipantRepository participants,
      FeatureRepository features,
      ChangeLogWriter changeLog,
      MethodRegistry methods,
      Broadcaster broadcaster,
      SessionLocks locks,
      IdGenerator ids,
      ClockPort clock,
      Transactions transactions) {
    this.sessions = sessions;
    this.participants = participants;
    this.features = features;
    this.changeLog = changeLog;
    this.methods = methods;
    this.broadcaster = broadcaster;
    this.locks = locks;
    this.ids = ids;
    this.clock = clock;
    this.transactions = transactions;
  }

  public void add(SessionId sessionId, UUID participantId, boolean facilitator, Add command) {
    locks.withLock(
        sessionId,
        () -> {
          Context context = context(sessionId, participantId, facilitator);
          Criteria criteria = criteria(context, command.criteria());
          if (features.externalIdTaken(sessionId, command.externalId(), null)) {
            throw new IntentRejectedException(ErrorCode.DUPLICATE_EXTERNAL_ID);
          }
          Feature feature =
              build(
                  () ->
                      Feature.create(
                          ids.newUuid(),
                          sessionId,
                          command.externalId(),
                          command.title(),
                          command.description(),
                          criteria));
          transactions.run(
              () -> {
                features.insert(feature);
                sessions.incrementVersion(sessionId);
              });
          broadcaster.publish(sessionId);
          return null;
        });
  }

  public void update(SessionId sessionId, UUID participantId, boolean facilitator, Update command) {
    locks.withLock(
        sessionId,
        () -> {
          Context context = context(sessionId, participantId, facilitator);
          Feature before = existing(context, command.featureId(), command.version());
          Map<String, Integer> changes = command.criteria() == null ? Map.of() : command.criteria();
          Criteria criteria = criteria(context, before.criteria(), changes);
          Feature after = before.withCriteria(criteria);
          if (command.externalId().present()) {
            after = apply(after, command.externalId().value(), Feature::withExternalId);
          }
          if (command.title().present()) {
            after = apply(after, command.title().value(), Feature::withTitle);
          }
          if (command.description().present()) {
            after = apply(after, command.description().value(), Feature::withDescription);
          }
          after = review(after, command);
          if (after.equals(before)) {
            // Rien ne change : pas de nouvelle version, mais l'état est renvoyé pour que le client
            // sache que sa demande a été traitée (sinon il attendrait une réponse sans fin).
            broadcaster.publish(sessionId);
            return null;
          }
          if (!after.externalId().equals(before.externalId())
              && features.externalIdTaken(sessionId, after.externalId(), before.id())) {
            throw new IntentRejectedException(ErrorCode.DUPLICATE_EXTERNAL_ID);
          }
          Feature saved = after;
          transactions.run(
              () -> {
                if (!features.update(saved)) {
                  throw new IntentRejectedException(ErrorCode.STALE_VERSION, saved.id());
                }
                for (String key : changedKeys(before.criteria(), saved.criteria())) {
                  changeLog.valueChanged(
                      sessionId,
                      context.author().pseudo(),
                      saved.id(),
                      key,
                      before.criteria().get(key),
                      saved.criteria().get(key));
                }
                sessions.incrementVersion(sessionId);
              });
          broadcaster.publish(sessionId);
          return null;
        });
  }

  public void delete(SessionId sessionId, UUID participantId, boolean facilitator, Delete command) {
    locks.withLock(
        sessionId,
        () -> {
          Context context = context(sessionId, participantId, facilitator);
          Feature before = existing(context, command.featureId(), command.version());
          Feature deleted = before.deleted(clock.now());
          transactions.run(
              () -> {
                if (!features.update(deleted)) {
                  throw new IntentRejectedException(ErrorCode.STALE_VERSION, before.id());
                }
                sessions.incrementVersion(sessionId);
              });
          broadcaster.publish(sessionId);
          return null;
        });
  }

  /** Droits, session ouverte aux écritures, méthode de la session et auteur. */
  private record Context(Session session, MethodDefinition method, Participant author) {}

  private Context context(SessionId sessionId, UUID participantId, boolean facilitator) {
    if (!facilitator) {
      throw new IntentRejectedException(ErrorCode.FORBIDDEN);
    }
    Session session = sessions.find(sessionId).orElseThrow(SessionNotFoundException::new);
    if (!session.isWritable()) {
      throw new IntentRejectedException(ErrorCode.SESSION_CLOSED);
    }
    Participant author =
        participants
            .findById(participantId)
            .orElseThrow(() -> new IntentRejectedException(ErrorCode.FORBIDDEN));
    MethodDefinition method = methods.get(session.method(), session.methodVersion()).definition();
    return new Context(session, method, author);
  }

  private Feature existing(Context context, UUID featureId, int version) {
    Feature feature =
        features
            .find(context.session().id(), featureId, context.method())
            .orElseThrow(() -> new IntentRejectedException(ErrorCode.STALE_VERSION, featureId));
    if (feature.version() != version) {
      throw new IntentRejectedException(ErrorCode.STALE_VERSION, featureId);
    }
    return feature;
  }

  private Criteria criteria(Context context, Map<String, Integer> input) {
    return criteria(context, Criteria.empty(), input == null ? Map.of() : input);
  }

  /** Clés d'abord (UNKNOWN_CRITERION), puis valeurs contre l'échelle (INVALID_VALUE). */
  private Criteria criteria(Context context, Criteria base, Map<String, Integer> changes) {
    Criteria merged;
    try {
      merged = base.with(context.method(), new HashMap<>(changes));
    } catch (UnknownCriterionException e) {
      throw new IntentRejectedException(ErrorCode.UNKNOWN_CRITERION);
    } catch (IllegalArgumentException e) {
      throw new IntentRejectedException(ErrorCode.INVALID_VALUE);
    }
    for (Map.Entry<String, Integer> change : changes.entrySet()) {
      Integer value = change.getValue();
      if (value != null && !context.session().scale().accepts(value)) {
        throw new IntentRejectedException(ErrorCode.INVALID_VALUE);
      }
    }
    return merged;
  }

  private static Feature review(Feature feature, Update command) {
    boolean marked =
        command.markedForReview().present()
            ? Boolean.TRUE.equals(command.markedForReview().value())
            : feature.markedForReview();
    if (!marked) {
      return feature.markedForReview() ? feature.unmark() : feature;
    }
    String reason =
        command.reviewReason().present() ? command.reviewReason().value() : feature.reviewReason();
    return apply(feature, reason, Feature::markForReview);
  }

  private static <T> Feature apply(
      Feature feature, T value, java.util.function.BiFunction<Feature, T, Feature> change) {
    return build(() -> change.apply(feature, value));
  }

  /** Une règle de domaine violée (longueur) est un message hors contrat. */
  private static Feature build(java.util.function.Supplier<Feature> supplier) {
    try {
      return supplier.get();
    } catch (IllegalArgumentException | NullPointerException e) {
      throw new IntentRejectedException(ErrorCode.INVALID_MESSAGE);
    }
  }

  private static Iterable<String> changedKeys(Criteria before, Criteria after) {
    java.util.Set<String> keys = new java.util.LinkedHashSet<>(before.keys());
    keys.addAll(after.keys());
    keys.removeIf(key -> java.util.Objects.equals(before.get(key), after.get(key)));
    return keys;
  }
}
