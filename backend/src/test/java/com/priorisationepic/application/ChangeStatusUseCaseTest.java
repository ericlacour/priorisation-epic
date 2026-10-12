package com.priorisationepic.application;

import static com.priorisationepic.application.RoundFixture.assertRejected;
import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.application.ChangeStatusUseCase.Action;
import com.priorisationepic.domain.SessionStatus;
import org.junit.jupiter.api.Test;

class ChangeStatusUseCaseTest {

  private RoundFixture fx = new RoundFixture(false);

  private ChangeStatusUseCase useCase() {
    return new ChangeStatusUseCase(fx.sessions, fx.broadcaster, fx.locks, fx.transactions);
  }

  private SessionStatus status() {
    return fx.sessions.find(RoundFixture.SESSION).orElseThrow().status();
  }

  @Test
  void startMovesTheSessionInProgressAndPublishes() {
    long version = fx.sessionVersion();
    assertThat(useCase().change(RoundFixture.SESSION, fx.facilitator, Action.START))
        .isEqualTo(Outcome.CHANGED);
    assertThat(status()).isEqualTo(SessionStatus.IN_PROGRESS);
    assertThat(fx.sessionVersion()).isEqualTo(version + 1);
    assertThat(fx.broadcaster.published).containsExactly(RoundFixture.SESSION);
  }

  @Test
  void startOnASessionAlreadyInProgressChangesNothing() {
    fx = new RoundFixture(true);
    long version = fx.sessionVersion();
    assertThat(useCase().change(RoundFixture.SESSION, fx.facilitator, Action.START))
        .isEqualTo(Outcome.UNCHANGED);
    assertThat(fx.sessionVersion()).isEqualTo(version);
    assertThat(fx.broadcaster.published).isEmpty();
  }

  @Test
  void onlyTheFacilitatorCanStart() {
    assertRejected(
        useCase().change(RoundFixture.SESSION, fx.aliceActor, Action.START), ErrorCode.FORBIDDEN);
    assertThat(status()).isEqualTo(SessionStatus.PREPARATION);
  }

  @Test
  void aClosedSessionCannotBeStarted() {
    fx = new RoundFixture(true);
    fx.sessions.put(fx.sessions.find(RoundFixture.SESSION).orElseThrow().close());
    assertRejected(
        useCase().change(RoundFixture.SESSION, fx.facilitator, Action.START),
        ErrorCode.SESSION_CLOSED);
  }
}
