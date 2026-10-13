package com.priorisationepic.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.domain.ChangeLogEntry;
import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.SessionStatus;
import com.priorisationepic.domain.method.MethodDefinition;
import com.priorisationepic.domain.method.MethodRegistry;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class FeatureUseCaseTest {

  private final MutableClock clock = new MutableClock(Instant.parse("2026-10-12T08:00:00Z"));
  private final InMemoryStore store = new InMemoryStore();
  private final RecordingBroadcaster broadcaster = new RecordingBroadcaster();
  private final IdGenerator ids = new IdGenerator(new Random(5));
  private final MethodRegistry methods = MethodRegistry.standard();
  private final MethodDefinition wsjf = methods.defaultMethod().definition();

  private SessionId session;
  private UUID facilitator;
  private UUID bob;
  private FeatureUseCase features;

  @BeforeEach
  void setUp() {
    session =
        new CreateSessionUseCase(store, store, methods, ids, clock::instant, store)
            .create(new CreateSessionUseCase.Command("Atelier", "Alice", null, null))
            .sessionId();
    new JoinSessionUseCase(
            store,
            store,
            broadcaster,
            new SessionLocks(),
            ids,
            clock::instant,
            store,
            java.time.Duration.ofMinutes(10))
        .join(session.value(), "Bob", null);
    facilitator = store.list(session).getFirst().id();
    bob = store.list(session).get(1).id();
    broadcaster.published.clear();
    features = featureUseCase(store);
  }

  private FeatureUseCase featureUseCase(FeatureRepository repository) {
    return new FeatureUseCase(
        store,
        store,
        repository,
        new ChangeLogWriter(store, clock::instant, ids),
        methods,
        broadcaster,
        new SessionLocks(),
        ids,
        clock::instant,
        store);
  }

  private static FeatureUseCase.Add add(String id, String title, Map<String, Integer> criteria) {
    return new FeatureUseCase.Add(id, title, null, criteria);
  }

  private static FeatureUseCase.Update update(Feature feature, Map<String, Integer> criteria) {
    return new FeatureUseCase.Update(
        feature.id(),
        feature.version(),
        Patch.absent(),
        Patch.absent(),
        Patch.absent(),
        criteria,
        Patch.absent(),
        Patch.absent());
  }

  private Feature addFull(String id) {
    features.add(
        session,
        facilitator,
        true,
        add(id, "Titre " + id, Map.of("bv", 8, "tc", 5, "rrOe", 3, "js", 4)));
    return stored(id);
  }

  private Feature stored(String externalId) {
    return store.listActive(session, wsjf).stream()
        .filter(f -> f.externalId().equals(externalId))
        .findFirst()
        .orElseThrow();
  }

  private ErrorCode rejection(Runnable action) {
    try {
      action.run();
    } catch (IntentRejectedException e) {
      return e.code();
    }
    throw new AssertionError("L'intention aurait dû être refusée");
  }

  private int sessionVersion() {
    return store.find(session).orElseThrow().version();
  }

  // --- Droits ---------------------------------------------------------------------------------

  @Test
  void onlyTheFacilitatorCanWrite() {
    Feature existing = addFull("F-1");
    broadcaster.published.clear();
    int version = sessionVersion();

    assertThat(rejection(() -> features.add(session, bob, false, add("F-2", "Autre", Map.of()))))
        .isEqualTo(ErrorCode.FORBIDDEN);
    assertThat(
            rejection(
                () -> features.update(session, bob, false, update(existing, Map.of("bv", 9)))))
        .isEqualTo(ErrorCode.FORBIDDEN);
    assertThat(
            rejection(
                () ->
                    features.delete(
                        session,
                        bob,
                        false,
                        new FeatureUseCase.Delete(existing.id(), existing.version()))))
        .isEqualTo(ErrorCode.FORBIDDEN);

    assertThat(store.listActive(session, wsjf)).containsExactly(existing);
    assertThat(sessionVersion()).isEqualTo(version);
    assertThat(broadcaster.published).isEmpty();
    assertThat(store.changeLog).isEmpty();
  }

  @Test
  void aClosedSessionRefusesEveryWrite() {
    Feature existing = addFull("F-1");
    Session open = store.find(session).orElseThrow();
    store.put(
        new Session(
            open.id(),
            open.name(),
            SessionStatus.CLOSED,
            open.method(),
            open.methodVersion(),
            open.scale(),
            open.createdAt(),
            open.createdBy(),
            open.version()));

    assertThat(rejection(() -> features.add(session, facilitator, true, add("F-2", "x", Map.of()))))
        .isEqualTo(ErrorCode.SESSION_CLOSED);
    assertThat(
            rejection(
                () ->
                    features.update(session, facilitator, true, update(existing, Map.of("bv", 1)))))
        .isEqualTo(ErrorCode.SESSION_CLOSED);
    assertThat(
            rejection(
                () ->
                    features.delete(
                        session, facilitator, true, new FeatureUseCase.Delete(existing.id(), 0))))
        .isEqualTo(ErrorCode.SESSION_CLOSED);
  }

  // --- Ajout ----------------------------------------------------------------------------------

  @Test
  void addingAFeatureStoresItBumpsTheSessionVersionAndBroadcastsOnce() {
    int version = sessionVersion();

    features.add(
        session,
        facilitator,
        true,
        new FeatureUseCase.Add("F-1", "Paiement", "Un clic", Map.of("bv", 8)));

    Feature feature = stored("F-1");
    assertThat(feature.title()).isEqualTo("Paiement");
    assertThat(feature.description()).isEqualTo("Un clic");
    assertThat(feature.criteria().get("bv")).isEqualTo(8);
    assertThat(feature.version()).isZero();
    assertThat(sessionVersion()).isEqualTo(version + 1);
    assertThat(broadcaster.published).containsExactly(session);
  }

  @Test
  void aFeatureCanBeAddedWithoutAnyValue() {
    features.add(session, facilitator, true, add("F-1", "Sans valeur", null));

    assertThat(stored("F-1").criteria().keys()).isEmpty();
  }

  @Test
  void creatingAFeatureWritesNoHistory() {
    addFull("F-1");

    assertThat(store.changeLog).isEmpty();
  }

  @Test
  void anExternalIdIsUniqueIgnoringCase() {
    addFull("F-1");
    broadcaster.published.clear();

    assertThat(
            rejection(
                () -> features.add(session, facilitator, true, add("f-1", "Doublon", Map.of()))))
        .isEqualTo(ErrorCode.DUPLICATE_EXTERNAL_ID);
    assertThat(store.listActive(session, wsjf)).hasSize(1);
    assertThat(broadcaster.published).isEmpty();
  }

  @Test
  void aDeletedFeatureFreesItsExternalId() {
    Feature first = addFull("F-1");
    features.delete(
        session, facilitator, true, new FeatureUseCase.Delete(first.id(), first.version()));

    features.add(session, facilitator, true, add("F-1", "Nouvelle", Map.of()));

    assertThat(store.listActive(session, wsjf)).hasSize(1);
  }

  @Test
  void anUnknownCriterionIsRefusedBeforeTheValues() {
    Map<String, Integer> bad = new HashMap<>();
    bad.put("reach", 3);
    bad.put("bv", 99);

    assertThat(rejection(() -> features.add(session, facilitator, true, add("F-1", "x", bad))))
        .isEqualTo(ErrorCode.UNKNOWN_CRITERION);
    assertThat(
            rejection(
                () -> features.add(session, facilitator, true, add("F-1", "x", Map.of("cod", 3)))))
        .isEqualTo(ErrorCode.UNKNOWN_CRITERION);
    assertThat(store.features).isEmpty();
  }

  @Test
  void aValueOutsideTheScaleIsRefused() {
    for (int value : new int[] {0, 11, -2, 1000}) {
      assertThat(
              rejection(
                  () ->
                      features.add(
                          session, facilitator, true, add("F-1", "x", Map.of("bv", value)))))
          .as("valeur %d", value)
          .isEqualTo(ErrorCode.INVALID_VALUE);
    }
    assertThat(store.features).isEmpty();
  }

  @Test
  void textOutsideTheLimitsIsRefusedAsInvalidMessage() {
    assertThat(
            rejection(
                () ->
                    features.add(
                        session, facilitator, true, add("F-1", "x".repeat(201), Map.of()))))
        .isEqualTo(ErrorCode.INVALID_MESSAGE);
    assertThat(
            rejection(
                () -> features.add(session, facilitator, true, add("   ", "Titre", Map.of()))))
        .isEqualTo(ErrorCode.INVALID_MESSAGE);
    assertThat(store.features).isEmpty();
  }

  // --- Modification et version ---------------------------------------------------------------

  @Test
  void aStaleVersionChangesNothingAndNamesTheFeature() {
    Feature existing = addFull("F-1");
    features.update(session, facilitator, true, update(existing, Map.of("js", 10)));
    int version = sessionVersion();
    broadcaster.published.clear();

    // Le client a lu la version 0 ; la fonctionnalité est maintenant à la version 1.
    IntentRejectedException rejected =
        catchRejection(
            () -> features.update(session, facilitator, true, update(existing, Map.of("js", 2))));

    assertThat(rejected.code()).isEqualTo(ErrorCode.STALE_VERSION);
    assertThat(rejected.featureId()).isEqualTo(existing.id());
    assertThat(stored("F-1").criteria().get("js")).isEqualTo(10);
    assertThat(sessionVersion()).isEqualTo(version);
    assertThat(broadcaster.published).isEmpty();
  }

  @Test
  void aFeatureThatNoLongerExistsIsStale() {
    Feature existing = addFull("F-1");
    features.delete(
        session, facilitator, true, new FeatureUseCase.Delete(existing.id(), existing.version()));

    assertThat(
            rejection(
                () ->
                    features.update(session, facilitator, true, update(existing, Map.of("bv", 1)))))
        .isEqualTo(ErrorCode.STALE_VERSION);
    assertThat(
            rejection(
                () ->
                    features.update(
                        session,
                        facilitator,
                        true,
                        new FeatureUseCase.Update(
                            UUID.randomUUID(),
                            0,
                            Patch.absent(),
                            Patch.absent(),
                            Patch.absent(),
                            Map.of(),
                            Patch.absent(),
                            Patch.absent()))))
        .isEqualTo(ErrorCode.STALE_VERSION);
  }

  @Test
  void aConcurrentWriteDetectedByTheRepositoryIsStaleAndWritesNoHistory() {
    Feature existing = addFull("F-1");
    FeatureRepository concurrent = new StaleOnUpdate(store);

    assertThat(
            rejection(
                () ->
                    featureUseCase(concurrent)
                        .update(session, facilitator, true, update(existing, Map.of("bv", 1)))))
        .isEqualTo(ErrorCode.STALE_VERSION);
    assertThat(store.changeLog).isEmpty();
    assertThat(stored("F-1").criteria().get("bv")).isEqualTo(8);
  }

  @Test
  void updatingValuesRecomputesNothingStoredAndBroadcasts() {
    Feature existing = addFull("F-1");
    broadcaster.published.clear();

    features.update(session, facilitator, true, update(existing, Map.of("js", 10)));

    Feature after = stored("F-1");
    assertThat(after.criteria().get("js")).isEqualTo(10);
    assertThat(after.criteria().get("bv")).isEqualTo(8);
    assertThat(after.version()).isEqualTo(existing.version() + 1);
    assertThat(broadcaster.published).containsExactly(session);
  }

  @Test
  void aValueChangeIsTracedOncePerModifiedCriterionInTheSameTransaction() {
    Feature existing = addFull("F-1");
    Map<String, Integer> changes = new HashMap<>();
    changes.put("bv", 9);
    changes.put("tc", 5);
    changes.put("js", null);

    features.update(session, facilitator, true, update(existing, changes));

    List<ChangeLogEntry> log = store.changeLog;
    assertThat(log).hasSize(2);
    assertThat(log)
        .extracting(
            ChangeLogEntry::field,
            ChangeLogEntry::action,
            ChangeLogEntry::oldValue,
            ChangeLogEntry::newValue)
        .containsExactlyInAnyOrder(
            org.assertj.core.groups.Tuple.tuple("bv", ChangeLogEntry.Action.VALUE_CHANGE, "8", "9"),
            org.assertj.core.groups.Tuple.tuple(
                "js", ChangeLogEntry.Action.VALUE_CHANGE, "4", null));
    assertThat(log.getFirst().author().value()).isEqualTo("Alice");
    assertThat(log.getFirst().entityType()).isEqualTo(ChangeLogEntry.EntityType.FEATURE);
    assertThat(log.getFirst().entityId()).isEqualTo(existing.id().toString());
    assertThat(log.getFirst().at()).isEqualTo(clock.instant());
  }

  @Test
  void enteringAFirstValueIsTracedWithoutAnOldValue() {
    features.add(session, facilitator, true, add("F-1", "x", null));
    Feature existing = stored("F-1");

    features.update(session, facilitator, true, update(existing, Map.of("bv", 3)));

    assertThat(store.changeLog).hasSize(1);
    assertThat(store.changeLog.getFirst().oldValue()).isNull();
    assertThat(store.changeLog.getFirst().newValue()).isEqualTo("3");
  }

  @Test
  void titleDescriptionAndDeletionWriteNoHistory() {
    Feature existing = addFull("F-1");

    features.update(
        session,
        facilitator,
        true,
        new FeatureUseCase.Update(
            existing.id(),
            existing.version(),
            Patch.absent(),
            Patch.of("Nouveau titre"),
            Patch.of("Un descriptif"),
            null,
            Patch.absent(),
            Patch.absent()));
    Feature renamed = stored("F-1");
    features.delete(
        session, facilitator, true, new FeatureUseCase.Delete(renamed.id(), renamed.version()));

    assertThat(renamed.title()).isEqualTo("Nouveau titre");
    assertThat(renamed.description()).isEqualTo("Un descriptif");
    assertThat(store.changeLog).isEmpty();
  }

  @Test
  void anIntentAlreadySatisfiedChangesNothingAndRaisesNoError() {
    Feature existing = addFull("F-1");
    int version = sessionVersion();
    broadcaster.published.clear();

    features.update(session, facilitator, true, update(existing, Map.of("bv", 8, "js", 4)));

    assertThat(stored("F-1")).isEqualTo(existing);
    assertThat(sessionVersion()).isEqualTo(version);
    assertThat(broadcaster.published).isEmpty();
    assertThat(store.changeLog).isEmpty();
  }

  @Test
  void updatingWithAnUnknownCriterionOrAValueOutsideTheScaleIsRefused() {
    Feature existing = addFull("F-1");

    assertThat(
            rejection(
                () ->
                    features.update(
                        session, facilitator, true, update(existing, Map.of("reach", 3)))))
        .isEqualTo(ErrorCode.UNKNOWN_CRITERION);
    assertThat(
            rejection(
                () ->
                    features.update(
                        session, facilitator, true, update(existing, Map.of("bv", 11)))))
        .isEqualTo(ErrorCode.INVALID_VALUE);
    assertThat(stored("F-1")).isEqualTo(existing);
  }

  @Test
  void renamingToAnExistingExternalIdIsRefusedButKeepingItIsFine() {
    Feature first = addFull("F-1");
    addFull("F-2");

    assertThat(
            rejection(
                () ->
                    features.update(
                        session,
                        facilitator,
                        true,
                        new FeatureUseCase.Update(
                            first.id(),
                            first.version(),
                            Patch.of("f-2"),
                            Patch.absent(),
                            Patch.absent(),
                            null,
                            Patch.absent(),
                            Patch.absent()))))
        .isEqualTo(ErrorCode.DUPLICATE_EXTERNAL_ID);

    features.update(
        session,
        facilitator,
        true,
        new FeatureUseCase.Update(
            first.id(),
            first.version(),
            Patch.of("F-1"),
            Patch.of("Autre titre"),
            Patch.absent(),
            null,
            Patch.absent(),
            Patch.absent()));
    assertThat(stored("F-1").title()).isEqualTo("Autre titre");
  }

  @Test
  void descriptionCanBeClearedWithANullValue() {
    features.add(session, facilitator, true, new FeatureUseCase.Add("F-1", "x", "texte", null));
    Feature existing = stored("F-1");

    features.update(
        session,
        facilitator,
        true,
        new FeatureUseCase.Update(
            existing.id(),
            existing.version(),
            Patch.absent(),
            Patch.absent(),
            Patch.of(null),
            null,
            Patch.absent(),
            Patch.absent()));

    assertThat(stored("F-1").description()).isNull();
  }

  // --- Marque « à revoir » --------------------------------------------------------------------

  private FeatureUseCase.Update review(
      Feature feature, Boolean marked, String reason, boolean withReason) {
    return new FeatureUseCase.Update(
        feature.id(),
        feature.version(),
        Patch.absent(),
        Patch.absent(),
        Patch.absent(),
        null,
        marked == null ? Patch.absent() : Patch.of(marked),
        withReason ? Patch.of(reason) : Patch.absent());
  }

  @Test
  void theFacilitatorMarksAFeatureForReviewWithAReasonAndRemovesTheMark() {
    Feature existing = addFull("F-1");

    features.update(session, facilitator, true, review(existing, true, "À confirmer", true));
    Feature marked = stored("F-1");
    assertThat(marked.markedForReview()).isTrue();
    assertThat(marked.reviewReason()).isEqualTo("À confirmer");

    features.update(session, facilitator, true, review(marked, false, "ignoré", true));
    Feature unmarked = stored("F-1");
    assertThat(unmarked.markedForReview()).isFalse();
    assertThat(unmarked.reviewReason()).isNull();
  }

  @Test
  void theReasonCanChangeWhileTheMarkStays() {
    Feature existing = addFull("F-1");
    features.update(session, facilitator, true, review(existing, true, "Avant", true));

    features.update(session, facilitator, true, review(stored("F-1"), null, "Après", true));

    assertThat(stored("F-1").markedForReview()).isTrue();
    assertThat(stored("F-1").reviewReason()).isEqualTo("Après");
  }

  @Test
  void theReasonIsLimitedTo200Characters() {
    Feature existing = addFull("F-1");

    features.update(session, facilitator, true, review(existing, true, "x".repeat(200), true));
    assertThat(stored("F-1").reviewReason()).hasSize(200);
    assertThat(
            rejection(
                () ->
                    features.update(
                        session,
                        facilitator,
                        true,
                        review(stored("F-1"), true, "x".repeat(201), true))))
        .isEqualTo(ErrorCode.INVALID_MESSAGE);
  }

  @Test
  void onlyTheFacilitatorMarksAFeature() {
    Feature existing = addFull("F-1");

    assertThat(
            rejection(
                () -> features.update(session, bob, false, review(existing, true, null, false))))
        .isEqualTo(ErrorCode.FORBIDDEN);
    assertThat(stored("F-1").markedForReview()).isFalse();
  }

  @Test
  void theMarkChangesNeitherTheScoreNorTheRankNorTheHistory() {
    Feature existing = addFull("F-1");
    SessionStateAssembler assembler =
        new SessionStateAssembler(store, store, store, methods, broadcaster);
    var before = assembler.readOnlyView(session).orElseThrow().features().getFirst();

    features.update(session, facilitator, true, review(existing, true, "À revoir", true));

    var after = assembler.readOnlyView(session).orElseThrow().features().getFirst();
    assertThat(after.score()).isEqualTo(before.score());
    assertThat(after.criteria()).isEqualTo(before.criteria());
    assertThat(after.markedForReview()).isTrue();
    assertThat(store.changeLog).isEmpty();
  }

  // --- Suppression ----------------------------------------------------------------------------

  @Test
  void deletionIsSoftAndLeavesOtherFeaturesAlone() {
    Feature first = addFull("F-1");
    addFull("F-2");
    broadcaster.published.clear();

    features.delete(
        session, facilitator, true, new FeatureUseCase.Delete(first.id(), first.version()));

    assertThat(store.features.get(first.id()).deletedAt()).isEqualTo(clock.instant());
    assertThat(store.listActive(session, wsjf))
        .extracting(Feature::externalId)
        .containsExactly("F-2");
    assertThat(broadcaster.published).containsExactly(session);
  }

  @Test
  void deletingWithAStaleVersionIsRefused() {
    Feature first = addFull("F-1");

    IntentRejectedException rejected =
        catchRejection(
            () ->
                features.delete(
                    session,
                    facilitator,
                    true,
                    new FeatureUseCase.Delete(first.id(), first.version() + 4)));

    assertThat(rejected.code()).isEqualTo(ErrorCode.STALE_VERSION);
    assertThat(rejected.featureId()).isEqualTo(first.id());
    assertThat(store.listActive(session, wsjf)).hasSize(1);
  }

  @Test
  void aSecondDeleteOfTheSameFeatureIsStale() {
    Feature first = addFull("F-1");
    features.delete(
        session, facilitator, true, new FeatureUseCase.Delete(first.id(), first.version()));

    assertThat(
            rejection(
                () ->
                    features.delete(
                        session,
                        facilitator,
                        true,
                        new FeatureUseCase.Delete(first.id(), first.version()))))
        .isEqualTo(ErrorCode.STALE_VERSION);
  }

  private IntentRejectedException catchRejection(Runnable action) {
    try {
      action.run();
    } catch (IntentRejectedException e) {
      return e;
    }
    throw new AssertionError("L'intention aurait dû être refusée");
  }

  /** Dépôt de fonctionnalités dont l'écriture détecte toujours une version périmée. */
  private record StaleOnUpdate(InMemoryStore store) implements FeatureRepository {
    @Override
    public int countActive(SessionId sessionId) {
      return store.countActive(sessionId);
    }

    @Override
    public void insert(Feature feature) {
      store.insert(feature);
    }

    @Override
    public Optional<Feature> find(SessionId sessionId, UUID featureId, MethodDefinition method) {
      return store.find(sessionId, featureId, method);
    }

    @Override
    public List<Feature> listActive(SessionId sessionId, MethodDefinition method) {
      return store.listActive(sessionId, method);
    }

    @Override
    public boolean update(Feature feature) {
      return false;
    }

    @Override
    public boolean externalIdTaken(SessionId sessionId, String externalId, UUID exceptFeatureId) {
      return store.externalIdTaken(sessionId, externalId, exceptFeatureId);
    }
  }
}
