package com.priorisationepic.domain;

import static com.priorisationepic.domain.SessionStatus.Action.CLOSE;
import static com.priorisationepic.domain.SessionStatus.Action.REOPEN;
import static com.priorisationepic.domain.SessionStatus.Action.START;
import static com.priorisationepic.domain.SessionStatus.CLOSED;
import static com.priorisationepic.domain.SessionStatus.IN_PROGRESS;
import static com.priorisationepic.domain.SessionStatus.PREPARATION;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.domain.SessionStatus.TransitionRefusedException;
import com.priorisationepic.domain.SessionStatus.TransitionRefusedException.Reason;
import org.junit.jupiter.api.Test;

/** Transitions de statut d'une session (FR-004, data-model.md). */
class SessionStatusTest {

  @Test
  void startMovesAPreparedSessionInProgress() {
    assertThat(PREPARATION.after(START)).isEqualTo(IN_PROGRESS);
  }

  @Test
  void startingASessionAlreadyInProgressChangesNothing() {
    assertThat(IN_PROGRESS.after(START)).isEqualTo(IN_PROGRESS);
  }

  @Test
  void closeThenReopenGoesBackInProgress() {
    SessionStatus closed = IN_PROGRESS.after(CLOSE);

    assertThat(closed).isEqualTo(CLOSED);
    assertThat(closed.after(REOPEN)).isEqualTo(IN_PROGRESS);
  }

  @Test
  void reopeningASessionThatIsNotClosedChangesNothing() {
    assertThat(IN_PROGRESS.after(REOPEN)).isEqualTo(IN_PROGRESS);
    assertThat(PREPARATION.after(REOPEN)).isEqualTo(PREPARATION);
  }

  @Test
  void aClosedSessionRefusesEverythingButReopen() {
    assertThat(CLOSED.allowsWrites()).isFalse();
    for (SessionStatus.Action action : new SessionStatus.Action[] {START, CLOSE}) {
      assertThatThrownBy(() -> CLOSED.after(action))
          .isInstanceOfSatisfying(
              TransitionRefusedException.class,
              e -> assertThat(e.reason()).isEqualTo(Reason.CLOSED));
    }
  }

  @Test
  void aSessionInPreparationCannotBeClosed() {
    assertThatThrownBy(() -> PREPARATION.after(CLOSE))
        .isInstanceOfSatisfying(
            TransitionRefusedException.class,
            e -> assertThat(e.reason()).isEqualTo(Reason.NOT_STARTED));
  }

  @Test
  void writesAreAllowedBeforeTheClosing() {
    assertThat(PREPARATION.allowsWrites()).isTrue();
    assertThat(IN_PROGRESS.allowsWrites()).isTrue();
  }
}
