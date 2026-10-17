package com.priorisationepic.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.SessionStatus;
import com.priorisationepic.domain.SessionStatus.Action;
import com.priorisationepic.domain.method.MethodRegistry;
import java.time.Instant;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Intention {@code changeStatus} : démarrer, clôturer et rouvrir (FR-004, FR-026). */
class ChangeStatusUseCaseTest {

  private final MutableClock clock = new MutableClock(Instant.parse("2026-10-12T08:00:00Z"));
  private final InMemoryStore store = new InMemoryStore();
  private final RecordingBroadcaster broadcaster = new RecordingBroadcaster();

  private SessionId session;
  private ChangeStatusUseCase statuses;

  @BeforeEach
  void setUp() {
    session =
        new CreateSessionUseCase(
                store,
                store,
                MethodRegistry.standard(),
                new IdGenerator(new Random(7)),
                clock::instant,
                store)
            .create(new CreateSessionUseCase.Command("Atelier", "Alice", null, null))
            .sessionId();
    statuses = new ChangeStatusUseCase(store, broadcaster, new SessionLocks(), store);
  }

  private SessionStatus status() {
    return store.find(session).orElseThrow().status();
  }

  private int version() {
    return store.find(session).orElseThrow().version();
  }

  private ErrorCode rejection(boolean facilitator, Action action) {
    try {
      statuses.change(session, facilitator, action);
    } catch (IntentRejectedException e) {
      return e.code();
    }
    throw new AssertionError("L'intention aurait dû être refusée");
  }

  @Test
  void onlyTheFacilitatorChangesTheStatus() {
    assertThat(rejection(false, Action.START)).isEqualTo(ErrorCode.FORBIDDEN);
    assertThat(status()).isEqualTo(SessionStatus.PREPARATION);
    assertThat(broadcaster.published).isEmpty();
  }

  @Test
  void eachChangeIsSavedCountedAndBroadcast() {
    statuses.change(session, true, Action.START);
    assertThat(status()).isEqualTo(SessionStatus.IN_PROGRESS);
    assertThat(version()).isEqualTo(1);

    statuses.change(session, true, Action.CLOSE);
    assertThat(status()).isEqualTo(SessionStatus.CLOSED);

    statuses.change(session, true, Action.REOPEN);
    assertThat(status()).isEqualTo(SessionStatus.IN_PROGRESS);
    assertThat(version()).isEqualTo(3);
    assertThat(broadcaster.published).hasSize(3);
  }

  @Test
  void anActionWithoutEffectOnlyAnswersWithTheState() {
    statuses.change(session, true, Action.START);
    broadcaster.published.clear();

    statuses.change(session, true, Action.START);
    statuses.change(session, true, Action.REOPEN);

    assertThat(version()).isEqualTo(1);
    assertThat(broadcaster.published).hasSize(2);
  }

  @Test
  void aClosedSessionOnlyAcceptsReopen() {
    statuses.change(session, true, Action.START);
    statuses.change(session, true, Action.CLOSE);

    assertThat(rejection(true, Action.START)).isEqualTo(ErrorCode.SESSION_CLOSED);
    assertThat(rejection(true, Action.CLOSE)).isEqualTo(ErrorCode.SESSION_CLOSED);
    assertThat(status()).isEqualTo(SessionStatus.CLOSED);
  }

  @Test
  void aSessionInPreparationIsNotClosed() {
    assertThat(rejection(true, Action.CLOSE)).isEqualTo(ErrorCode.SESSION_NOT_STARTED);
    assertThat(status()).isEqualTo(SessionStatus.PREPARATION);
  }
}
