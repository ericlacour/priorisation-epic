package com.priorisationepic.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.domain.method.MethodRegistry;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class SessionStatusTest {

  private static Session session() {
    return Session.create(
        MethodRegistry.standard(),
        new SessionId("k3Jx9QvT2mLpZ8wR4nYb7A"),
        "Atelier",
        null,
        "hash",
        Pseudo.of("eric"),
        Instant.parse("2026-10-12T08:00:00Z"));
  }

  @Test
  void startMovesFromPreparationToInProgress() {
    Session created = session();
    assertThat(created.status()).isEqualTo(SessionStatus.PREPARATION);
    assertThat(created.start().status()).isEqualTo(SessionStatus.IN_PROGRESS);
  }

  @Test
  void aSessionAlreadyInProgressCannotBeStartedAgainByTheDomain() {
    Session started = session().start();
    assertThatThrownBy(started::start).isInstanceOf(InvalidTransitionException.class);
  }

  @Test
  void roundsOpenOnlyInProgress() {
    assertThat(session().canOpenRound()).isFalse();
    assertThat(session().start().canOpenRound()).isTrue();
    assertThat(session().start().close().canOpenRound()).isFalse();
  }
}
