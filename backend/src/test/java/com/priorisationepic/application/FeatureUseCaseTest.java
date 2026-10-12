package com.priorisationepic.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.application.FeatureUseCase.Actor;
import com.priorisationepic.application.FeatureUseCase.Add;
import com.priorisationepic.application.FeatureUseCase.Delete;
import com.priorisationepic.application.FeatureUseCase.Outcome;
import com.priorisationepic.application.FeatureUseCase.Update;
import com.priorisationepic.domain.ChangeLogEntry;
import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.Role;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.Tokens;
import com.priorisationepic.domain.method.MethodRegistry;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class FeatureUseCaseTest {

  private static final SessionId SESSION = new SessionId("k3Jx9QvT2mLpZ8wR4nYb7A");
  private static final UUID ERIC_ID = UUID.randomUUID();
  private static final Actor FACILITATOR = new Actor(ERIC_ID, true);
  private static final Actor PARTICIPANT = new Actor(UUID.randomUUID(), false);

  private final MutableClock clock = new MutableClock(Instant.parse("2026-10-12T08:00:00Z"));
  private final InMemorySessionRepository sessions = new InMemorySessionRepository();
  private final InMemoryParticipantRepository participants = new InMemoryParticipantRepository();
  private final InMemoryFeatureRepository features = new InMemoryFeatureRepository();
  private final List<ChangeLogEntry> log = new ArrayList<>();
  private final RecordingBroadcaster broadcaster = new RecordingBroadcaster();
  private final FeatureUseCase useCase =
      new FeatureUseCase(
          sessions,
          participants,
          features,
          new ChangeLogWriter(log::add, clock::instant, new IdGenerator(new Random(5))),
          broadcaster,
          new SessionLocks(),
          new InMemoryTransactions(),
          clock::instant,
          new IdGenerator(new Random(7)),
          MethodRegistry.standard());

  @BeforeEach
  void seed() {
    sessions.insert(
        Session.create(
            MethodRegistry.standard(),
            SESSION,
            "Atelier",
            null,
            Tokens.hash("animation"),
            Pseudo.of("eric"),
            clock.instant()));
    participants.insert(
        Participant.join(
            ERIC_ID,
            SESSION,
            Pseudo.of("eric"),
            Role.FACILITATOR,
            Tokens.hash("eric-token"),
            clock.instant()));
  }

  private static Add add(String externalId, String title, Map<String, Integer> criteria) {
    return new Add(externalId, title, null, criteria);
  }

  private Feature addAndGet(String externalId, Map<String, Integer> criteria) {
    assertThat(useCase.add(SESSION, FACILITATOR, add(externalId, "Titre " + externalId, criteria)))
        .isInstanceOf(Outcome.Accepted.class);
    return features.features.values().stream()
        .filter(f -> f.externalId().equals(externalId))
        .findFirst()
        .orElseThrow();
  }

  private static Update update(
      Feature f,
      Change<String> externalId,
      Change<String> title,
      Change<Map<String, Integer>> criteria,
      Change<Boolean> marked,
      Change<String> reason) {
    return new Update(
        f.id(), f.version(), externalId, title, Change.absent(), criteria, marked, reason);
  }

  private static Update setCriteria(Feature f, Map<String, Integer> criteria) {
    return update(
        f,
        Change.absent(),
        Change.absent(),
        Change.set(criteria),
        Change.absent(),
        Change.absent());
  }

  private static void assertRejected(Outcome outcome, ErrorCode code) {
    assertThat(outcome).isInstanceOf(Outcome.Rejected.class);
    assertThat(((Outcome.Rejected) outcome).code()).isEqualTo(code);
  }

  private long sessionVersion() {
    return sessions.find(SESSION).orElseThrow().version();
  }

  @Test
  void facilitatorAddsAFeatureWithoutCriteriaAndNothingIsLogged() {
    Feature f = addAndGet("F-1", null);
    assertThat(f.version()).isZero();
    assertThat(f.criteria().value("bv")).isEmpty();
    assertThat(log).isEmpty();
    assertThat(sessionVersion()).isEqualTo(1);
    assertThat(broadcaster.published).containsExactly(SESSION);
  }

  @Test
  void addsWithPartialCriteria() {
    Feature f = addAndGet("F-1", Map.of("bv", 8, "js", 3));
    assertThat(f.criteria().value("bv").getAsInt()).isEqualTo(8);
    assertThat(f.criteria().value("tc")).isEmpty();
    assertThat(log).isEmpty();
  }

  @Test
  void aParticipantCannotChangeFeatures() {
    assertRejected(useCase.add(SESSION, PARTICIPANT, add("F-1", "T", null)), ErrorCode.FORBIDDEN);
    Feature f = addAndGet("F-2", null);
    assertRejected(
        useCase.update(SESSION, PARTICIPANT, setCriteria(f, Map.of("bv", 1))), ErrorCode.FORBIDDEN);
    assertRejected(
        useCase.delete(SESSION, PARTICIPANT, new Delete(f.id(), f.version())), ErrorCode.FORBIDDEN);
    assertThat(features.features).hasSize(1);
  }

  @Test
  void aClosedSessionRefusesEverything() {
    Feature f = addAndGet("F-1", null);
    sessions.put(sessions.find(SESSION).orElseThrow().start().close());
    assertRejected(
        useCase.add(SESSION, FACILITATOR, add("F-2", "T", null)), ErrorCode.SESSION_CLOSED);
    assertRejected(
        useCase.update(SESSION, FACILITATOR, setCriteria(f, Map.of("bv", 1))),
        ErrorCode.SESSION_CLOSED);
    assertRejected(
        useCase.delete(SESSION, FACILITATOR, new Delete(f.id(), f.version())),
        ErrorCode.SESSION_CLOSED);
  }

  @Test
  void rejectsDuplicateExternalIdIgnoringCase() {
    addAndGet("F-1", null);
    assertRejected(
        useCase.add(SESSION, FACILITATOR, add("f-1", "Autre", null)),
        ErrorCode.DUPLICATE_EXTERNAL_ID);
    assertThat(features.features).hasSize(1);
  }

  @Test
  void rejectsInvalidAndUnknownCriteriaOnAdd() {
    assertRejected(
        useCase.add(SESSION, FACILITATOR, add("F-1", "T", Map.of("bv", 99))),
        ErrorCode.INVALID_VALUE);
    assertRejected(
        useCase.add(SESSION, FACILITATOR, add("F-1", "T", Map.of("zz", 1))),
        ErrorCode.UNKNOWN_CRITERION);
    assertRejected(
        useCase.add(SESSION, FACILITATOR, add("F-1", " ", null)), ErrorCode.INVALID_MESSAGE);
    assertThat(features.features).isEmpty();
    assertThat(sessionVersion()).isZero();
    assertThat(broadcaster.published).isEmpty();
  }

  @Test
  void updatingCriteriaLogsOnlyRealValueChanges() {
    Feature f = addAndGet("F-1", Map.of("bv", 8));
    Map<String, Integer> changes = new HashMap<>();
    changes.put("bv", 8);
    changes.put("tc", 5);
    assertThat(useCase.update(SESSION, FACILITATOR, setCriteria(f, changes)))
        .isInstanceOf(Outcome.Accepted.class);
    assertThat(log).hasSize(1);
    ChangeLogEntry entry = log.get(0);
    assertThat(entry.field()).isEqualTo("tc");
    assertThat(entry.oldValue()).isNull();
    assertThat(entry.newValue()).isEqualTo("5");
    assertThat(entry.author()).isEqualTo(Pseudo.of("eric"));
    Feature after = features.features.get(f.id());
    assertThat(after.version()).isEqualTo(1);
    assertThat(after.criteria().value("tc").getAsInt()).isEqualTo(5);
  }

  @Test
  void clearingACriterionIsLogged() {
    Feature f = addAndGet("F-1", Map.of("bv", 8));
    Map<String, Integer> clear = new HashMap<>();
    clear.put("bv", null);
    useCase.update(SESSION, FACILITATOR, setCriteria(f, clear));
    assertThat(log).hasSize(1);
    assertThat(log.get(0).oldValue()).isEqualTo("8");
    assertThat(log.get(0).newValue()).isNull();
  }

  @Test
  void titleExternalIdAndReviewMarkAreNotLogged() {
    Feature f = addAndGet("F-1", Map.of("bv", 8));
    Outcome outcome =
        useCase.update(
            SESSION,
            FACILITATOR,
            update(
                f,
                Change.set("F-9"),
                Change.set("Nouveau titre"),
                Change.absent(),
                Change.set(true),
                Change.set("à discuter")));
    assertThat(outcome).isInstanceOf(Outcome.Accepted.class);
    Feature after = features.features.get(f.id());
    assertThat(after.externalId()).isEqualTo("F-9");
    assertThat(after.title()).isEqualTo("Nouveau titre");
    assertThat(after.markedForReview()).isTrue();
    assertThat(after.reviewReason()).isEqualTo("à discuter");
    assertThat(after.criteria()).isEqualTo(f.criteria());
    assertThat(log).isEmpty();
  }

  @Test
  void unmarkingClearsTheReason() {
    Feature f = addAndGet("F-1", null);
    useCase.update(
        SESSION,
        FACILITATOR,
        update(
            f,
            Change.absent(),
            Change.absent(),
            Change.absent(),
            Change.set(true),
            Change.set("x")));
    Feature marked = features.features.get(f.id());
    useCase.update(
        SESSION,
        FACILITATOR,
        update(
            marked,
            Change.absent(),
            Change.absent(),
            Change.absent(),
            Change.set(false),
            Change.absent()));
    Feature after = features.features.get(f.id());
    assertThat(after.markedForReview()).isFalse();
    assertThat(after.reviewReason()).isNull();
  }

  @Test
  void aReasonWithoutMarkIsRefused() {
    Feature f = addAndGet("F-1", null);
    assertRejected(
        useCase.update(
            SESSION,
            FACILITATOR,
            update(
                f,
                Change.absent(),
                Change.absent(),
                Change.absent(),
                Change.absent(),
                Change.set("x"))),
        ErrorCode.INVALID_MESSAGE);
  }

  @Test
  void renamingToATakenIdIsRefusedButKeepingItIsFine() {
    addAndGet("F-1", null);
    Feature f2 = addAndGet("F-2", null);
    assertRejected(
        useCase.update(
            SESSION,
            FACILITATOR,
            update(
                f2,
                Change.set("f-1"),
                Change.absent(),
                Change.absent(),
                Change.absent(),
                Change.absent())),
        ErrorCode.DUPLICATE_EXTERNAL_ID);
    assertThat(
            useCase.update(
                SESSION,
                FACILITATOR,
                update(
                    f2,
                    Change.set("F-2"),
                    Change.set("Titre bis"),
                    Change.absent(),
                    Change.absent(),
                    Change.absent())))
        .isInstanceOf(Outcome.Accepted.class);
  }

  @Test
  void aStaleVersionIsRefusedWithTheFeatureAndChangesNothing() {
    Feature f = addAndGet("F-1", null);
    useCase.update(SESSION, FACILITATOR, setCriteria(f, Map.of("bv", 2)));
    long version = sessionVersion();
    Outcome outcome = useCase.update(SESSION, FACILITATOR, setCriteria(f, Map.of("bv", 9)));
    assertRejected(outcome, ErrorCode.STALE_VERSION);
    assertThat(((Outcome.Rejected) outcome).featureId()).isEqualTo(f.id());
    assertThat(features.features.get(f.id()).criteria().value("bv").getAsInt()).isEqualTo(2);
    assertThat(sessionVersion()).isEqualTo(version);
    assertThat(log).hasSize(1);
  }

  @Test
  void anUnknownFeatureIsStale() {
    Feature ghost = addAndGet("F-1", null);
    useCase.delete(SESSION, FACILITATOR, new Delete(ghost.id(), ghost.version()));
    assertRejected(
        useCase.update(SESSION, FACILITATOR, setCriteria(ghost, Map.of("bv", 1))),
        ErrorCode.STALE_VERSION);
  }

  @Test
  void aValueOutOfScaleIsRefusedAndAnUnknownCriterionToo() {
    Feature f = addAndGet("F-1", null);
    assertRejected(
        useCase.update(SESSION, FACILITATOR, setCriteria(f, Map.of("bv", 11))),
        ErrorCode.INVALID_VALUE);
    assertRejected(
        useCase.update(SESSION, FACILITATOR, setCriteria(f, Map.of("zz", 1))),
        ErrorCode.UNKNOWN_CRITERION);
    assertThat(log).isEmpty();
  }

  @Test
  void anUpdateWithNoRealChangeDoesNotBumpAnyVersion() {
    Feature f = addAndGet("F-1", Map.of("bv", 8));
    long version = sessionVersion();
    useCase.update(SESSION, FACILITATOR, setCriteria(f, Map.of("bv", 8)));
    assertThat(features.features.get(f.id()).version()).isZero();
    assertThat(sessionVersion()).isEqualTo(version);
    assertThat(log).isEmpty();
  }

  @Test
  void deletingIsSoftLogsNothingAndFreesTheIdentifier() {
    Feature f = addAndGet("F-1", Map.of("bv", 8));
    assertThat(useCase.delete(SESSION, FACILITATOR, new Delete(f.id(), f.version())))
        .isInstanceOf(Outcome.Accepted.class);
    assertThat(features.features.get(f.id()).isDeleted()).isTrue();
    assertThat(log).isEmpty();
    assertThat(features.countActive(SESSION)).isZero();
    addAndGet("F-1", null);
  }

  @Test
  void deletingAgainIsAnAcceptedNoOpButAStaleVersionIsRefused() {
    Feature f = addAndGet("F-1", null);
    useCase.update(SESSION, FACILITATOR, setCriteria(f, Map.of("bv", 2)));
    assertRejected(
        useCase.delete(SESSION, FACILITATOR, new Delete(f.id(), f.version())),
        ErrorCode.STALE_VERSION);
    Feature current = features.features.get(f.id());
    useCase.delete(SESSION, FACILITATOR, new Delete(current.id(), current.version()));
    assertThat(useCase.delete(SESSION, FACILITATOR, new Delete(f.id(), 0)))
        .isInstanceOf(Outcome.Accepted.class);
  }

  @Test
  void anUnknownSessionIsForbidden() {
    assertRejected(
        useCase.add(new SessionId("z".repeat(22)), FACILITATOR, add("F-1", "T", null)),
        ErrorCode.FORBIDDEN);
  }
}
