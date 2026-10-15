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
import com.priorisationepic.domain.method.Score;
import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.domain.scale.Scale.Impact;
import com.priorisationepic.domain.scale.ScaleType;
import java.time.Instant;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Intention {@code updateSettings} : nom et échelle de la session (FR-010, FR-011). */
class UpdateSettingsUseCaseTest {

  private final MutableClock clock = new MutableClock(Instant.parse("2026-10-12T08:00:00Z"));
  private final InMemoryStore store = new InMemoryStore();
  private final RecordingBroadcaster broadcaster = new RecordingBroadcaster();
  private final IdGenerator ids = new IdGenerator(new Random(7));
  private final MethodRegistry methods = MethodRegistry.standard();
  private final MethodDefinition wsjf = methods.defaultMethod().definition();

  private SessionId session;
  private UUID facilitator;
  private FeatureUseCase features;
  private UpdateSettingsUseCase settings;

  @BeforeEach
  void setUp() {
    session =
        new CreateSessionUseCase(store, store, methods, ids, clock::instant, store)
            .create(new CreateSessionUseCase.Command("Atelier", "Alice", null, null))
            .sessionId();
    facilitator = store.list(session).getFirst().id();
    SessionLocks locks = new SessionLocks();
    ChangeLogWriter changeLog = new ChangeLogWriter(store, clock::instant, ids);
    features =
        new FeatureUseCase(
            store,
            store,
            store,
            changeLog,
            methods,
            broadcaster,
            locks,
            ids,
            clock::instant,
            store);
    settings =
        new UpdateSettingsUseCase(
            store, store, store, changeLog, methods, broadcaster, locks, store);
  }

  private void addFeature(String externalId, Map<String, Integer> criteria) {
    features.add(
        session,
        facilitator,
        true,
        new FeatureUseCase.Add(externalId, "Titre " + externalId, null, criteria));
  }

  private Feature stored(String externalId) {
    return store.listActive(session, wsjf).stream()
        .filter(f -> f.externalId().equals(externalId))
        .findFirst()
        .orElseThrow();
  }

  private Session current() {
    return store.find(session).orElseThrow();
  }

  private IntentRejectedException rejection(Runnable action) {
    try {
      action.run();
    } catch (IntentRejectedException e) {
      return e;
    }
    throw new AssertionError("L'intention aurait dû être refusée");
  }

  private static UpdateSettingsUseCase.Command scale(ScaleType type, int max, boolean confirm) {
    return new UpdateSettingsUseCase.Command(null, type, max, confirm);
  }

  @Test
  void aParticipantCannotChangeTheSettings() {
    IntentRejectedException e =
        rejection(
            () ->
                settings.update(
                    session, facilitator, false, scale(ScaleType.CONTINUOUS, 20, false)));

    assertThat(e.code()).isEqualTo(ErrorCode.FORBIDDEN);
    assertThat(current().scale()).isEqualTo(Scale.defaultScale());
  }

  @Test
  void aClosedSessionRefusesTheChange() {
    Session s = current();
    store.put(
        new Session(
            s.id(),
            s.name(),
            SessionStatus.CLOSED,
            s.method(),
            s.methodVersion(),
            s.scale(),
            s.createdAt(),
            s.createdBy(),
            s.version()));

    assertThat(
            rejection(
                    () ->
                        settings.update(
                            session,
                            facilitator,
                            true,
                            new UpdateSettingsUseCase.Command("Autre", null, null, false)))
                .code())
        .isEqualTo(ErrorCode.SESSION_CLOSED);
  }

  @Test
  void wideningTheScaleIsAppliedWithoutConfirmationAndLogged() {
    addFeature("F-1", Map.of("bv", 8, "tc", 5, "rrOe", 3, "js", 4));
    int before = current().version();
    broadcaster.published.clear();

    settings.update(session, facilitator, true, scale(ScaleType.CONTINUOUS, 20, false));

    assertThat(current().scale()).isEqualTo(new Scale(ScaleType.CONTINUOUS, 20));
    assertThat(current().version()).isEqualTo(before + 1);
    assertThat(broadcaster.published).containsExactly(session);
    ChangeLogEntry entry = store.changeLog.getLast();
    assertThat(entry.action()).isEqualTo(ChangeLogEntry.Action.SCALE_CHANGE);
    assertThat(entry.entityType()).isEqualTo(ChangeLogEntry.EntityType.SESSION);
    assertThat(entry.author().value()).isEqualTo("Alice");
    assertThat(entry.oldValue()).isEqualTo("{\"type\":\"CONTINUOUS\",\"max\":10}");
    assertThat(entry.newValue()).isEqualTo("{\"type\":\"CONTINUOUS\",\"max\":20}");
  }

  @Test
  void withoutConfirmAnImpactingChangeIsRefusedWithTheImpactedValues() {
    addFeature("F-1", Map.of("bv", 4, "tc", 5, "rrOe", 3, "js", 10));
    addFeature("F-2", Map.of("bv", 8));
    int before = current().version();
    int log = store.changeLog.size();
    broadcaster.published.clear();

    IntentRejectedException e =
        rejection(
            () ->
                settings.update(session, facilitator, true, scale(ScaleType.FIBONACCI, 13, false)));

    assertThat(e.code()).isEqualTo(ErrorCode.SCALE_IMPACT);
    assertThat(e.impactedValues())
        .containsExactly(new Impact("F-1", "bv", 4), new Impact("F-1", "js", 10));
    assertThat(current().scale()).isEqualTo(Scale.defaultScale());
    assertThat(current().version()).isEqualTo(before);
    assertThat(store.changeLog).hasSize(log);
    assertThat(broadcaster.published).isEmpty();
  }

  @Test
  void withConfirmTheScaleIsAppliedAndTheFeatureLeavesTheCalculation() {
    addFeature("F-1", Map.of("bv", 4, "tc", 5, "rrOe", 3, "js", 10));
    addFeature("F-2", Map.of("bv", 8, "tc", 5, "rrOe", 3, "js", 2));

    settings.update(session, facilitator, true, scale(ScaleType.FIBONACCI, 13, true));

    Scale scale = current().scale();
    assertThat(scale).isEqualTo(new Scale(ScaleType.FIBONACCI, 13));
    Score f1 = Score.of(methods.defaultMethod(), stored("F-1").criteria(), scale);
    assertThat(f1.complete()).isFalse();
    assertThat(f1.outOfScale()).containsExactly("bv", "js");
    // Les valeurs ne sont pas effacées : elles restent visibles, signalées « hors échelle ».
    assertThat(stored("F-1").criteria().get("bv")).isEqualTo(4);
    assertThat(Score.of(methods.defaultMethod(), stored("F-2").criteria(), scale).complete())
        .isTrue();
    assertThat(store.changeLog.getLast().action()).isEqualTo(ChangeLogEntry.Action.SCALE_CHANGE);
  }

  @Test
  void aSimpleRenameIsAcceptedWithoutConfirmationNorHistory() {
    addFeature("F-1", Map.of("bv", 4));
    int log = store.changeLog.size();

    settings.update(
        session,
        facilitator,
        true,
        new UpdateSettingsUseCase.Command("PI 28 – Epics", null, null, false));

    assertThat(current().name()).isEqualTo("PI 28 – Epics");
    assertThat(current().scale()).isEqualTo(Scale.defaultScale());
    assertThat(store.changeLog).hasSize(log);
  }

  @Test
  void anInvalidScaleIsRefused() {
    assertThat(
            rejection(
                    () ->
                        settings.update(
                            session, facilitator, true, scale(ScaleType.FIBONACCI, 10, true)))
                .code())
        .isEqualTo(ErrorCode.INVALID_VALUE);
    assertThat(
            rejection(
                    () ->
                        settings.update(
                            session, facilitator, true, scale(ScaleType.CONTINUOUS, 101, true)))
                .code())
        .isEqualTo(ErrorCode.INVALID_VALUE);
  }

  @Test
  void theSameScaleChangesNothingButAnswersWithTheState() {
    int before = current().version();
    int log = store.changeLog.size();
    broadcaster.published.clear();

    settings.update(session, facilitator, true, scale(ScaleType.CONTINUOUS, 10, false));

    assertThat(current().version()).isEqualTo(before);
    assertThat(store.changeLog).hasSize(log);
    assertThat(broadcaster.published).containsExactly(session);
  }

  @Test
  void renameAndImpactingScaleWithoutConfirmChangeNothing() {
    settings.update(session, facilitator, true, scale(ScaleType.CONTINUOUS, 20, false));
    addFeature("F-1", Map.of("bv", 15));

    IntentRejectedException e =
        rejection(
            () ->
                settings.update(
                    session,
                    facilitator,
                    true,
                    new UpdateSettingsUseCase.Command("Autre", ScaleType.CONTINUOUS, 10, false)));

    assertThat(e.code()).isEqualTo(ErrorCode.SCALE_IMPACT);
    assertThat(current().name()).isEqualTo("Atelier");
  }
}
