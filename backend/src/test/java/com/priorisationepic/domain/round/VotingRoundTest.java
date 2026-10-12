package com.priorisationepic.domain.round;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.domain.SessionId;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class VotingRoundTest {

  private static final SessionId SESSION = new SessionId("k3Jx9QvT2mLpZ8wR4nYb7A");
  private static final Instant NOW = Instant.parse("2026-10-12T08:00:00Z");
  private final UUID f1 = UUID.randomUUID();
  private final UUID f2 = UUID.randomUUID();

  private VotingRound open(List<UUID> features) {
    return VotingRound.open(UUID.randomUUID(), SESSION, 1, features, null, NOW);
  }

  @Test
  void opensOnTheSelectionInOrder() {
    VotingRound round = open(List.of(f2, f1));
    assertThat(round.status()).isEqualTo(RoundStatus.OPEN);
    assertThat(round.isOpen()).isTrue();
    assertThat(round.featureIds()).containsExactly(f2, f1);
    assertThat(round.contains(f1)).isTrue();
    assertThat(round.contains(UUID.randomUUID())).isFalse();
    assertThat(round.revealedAt()).isNull();
  }

  @Test
  void needsAtLeastOneFeatureAndNoDuplicate() {
    assertThatThrownBy(() -> open(List.of())).isInstanceOf(InvalidRoundException.class);
    assertThatThrownBy(() -> open(List.of(f1, f1))).isInstanceOf(InvalidRoundException.class);
    assertThatThrownBy(
            () -> VotingRound.open(UUID.randomUUID(), SESSION, 0, List.of(f1), null, NOW))
        .isInstanceOf(InvalidRoundException.class);
  }

  @Test
  void openThenRevealedIsTheOnlyTransition() {
    VotingRound revealed = open(List.of(f1)).reveal(NOW.plusSeconds(60));
    assertThat(revealed.status()).isEqualTo(RoundStatus.REVEALED);
    assertThat(revealed.revealedAt()).isEqualTo(NOW.plusSeconds(60));
    assertThat(revealed.openedAt()).isEqualTo(NOW);
    assertThatThrownBy(() -> revealed.reveal(NOW)).isInstanceOf(RoundRevealedException.class);
  }

  @Test
  void aRevealedRoundIsImmutable() {
    VotingRound revealed = open(List.of(f1)).reveal(NOW);
    assertThatThrownBy(revealed::ensureOpen).isInstanceOf(RoundRevealedException.class);
    open(List.of(f1)).ensureOpen();
  }

  @Test
  void aRelaunchedRoundKeepsThePreviousRoundId() {
    UUID previous = UUID.randomUUID();
    VotingRound relaunched =
        VotingRound.open(UUID.randomUUID(), SESSION, 2, List.of(f2), previous, NOW);
    assertThat(relaunched.previousRoundId()).isEqualTo(previous);
    assertThat(relaunched.number()).isEqualTo(2);
  }
}
