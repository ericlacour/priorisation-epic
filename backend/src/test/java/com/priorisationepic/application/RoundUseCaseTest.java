package com.priorisationepic.application;

import static com.priorisationepic.application.RoundFixture.assertRejected;
import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.application.RoundUseCase.Open;
import com.priorisationepic.domain.round.RoundStatus;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RoundUseCaseTest {

  private static final java.util.Map<String, Integer> NONE = java.util.Map.of();
  private final RoundFixture fx = new RoundFixture();
  private final RoundUseCase useCase = fx.roundUseCase();

  private Outcome open(List<UUID> ids, UUID previous) {
    return useCase.open(RoundFixture.SESSION, fx.facilitator, new Open(ids, previous));
  }

  @Test
  void opensARoundOnTheSelectionAndPublishes() {
    long version = fx.sessionVersion();
    assertThat(open(List.of(fx.f1.id(), fx.f2.id()), null)).isEqualTo(Outcome.CHANGED);

    assertThat(fx.rounds.findAll(RoundFixture.SESSION)).hasSize(1);
    var round = fx.rounds.findAll(RoundFixture.SESSION).get(0);
    assertThat(round.number()).isEqualTo(1);
    assertThat(round.status()).isEqualTo(RoundStatus.OPEN);
    assertThat(round.featureIds()).containsExactly(fx.f1.id(), fx.f2.id());
    assertThat(fx.sessionVersion()).isEqualTo(version + 1);
    assertThat(fx.broadcaster.published).containsExactly(RoundFixture.SESSION);
  }

  @Test
  void aParticipantCannotOpenOrReveal() {
    assertRejected(
        useCase.open(RoundFixture.SESSION, fx.aliceActor, new Open(List.of(fx.f1.id()), null)),
        ErrorCode.FORBIDDEN);
    UUID round = fx.openRound(fx.f1.id());
    assertRejected(useCase.reveal(RoundFixture.SESSION, fx.aliceActor, round), ErrorCode.FORBIDDEN);
    assertThat(fx.rounds.rounds.get(round).isOpen()).isTrue();
  }

  @Test
  void aSessionInPreparationRefusesToOpenARound() {
    RoundFixture preparation = new RoundFixture(false);
    Outcome outcome =
        preparation
            .roundUseCase()
            .open(
                RoundFixture.SESSION,
                preparation.facilitator,
                new Open(List.of(preparation.f1.id()), null));
    assertRejected(outcome, ErrorCode.SESSION_NOT_STARTED);
    assertThat(preparation.rounds.rounds).isEmpty();
    assertThat(preparation.broadcaster.published).isEmpty();
  }

  @Test
  void aClosedSessionRefuses() {
    fx.sessions.put(fx.sessions.find(RoundFixture.SESSION).orElseThrow().close());
    assertRejected(open(List.of(fx.f1.id()), null), ErrorCode.SESSION_CLOSED);
  }

  @Test
  void aFeatureInAnOpenRoundCannotJoinAnotherOne() {
    fx.openRound(fx.f1.id());
    Outcome outcome = open(List.of(fx.f2.id(), fx.f1.id()), null);
    assertRejected(outcome, ErrorCode.FEATURE_IN_OPEN_ROUND);
    assertThat(((Outcome.Rejected) outcome).featureId()).isEqualTo(fx.f1.id());
    assertThat(fx.rounds.rounds).hasSize(1);
  }

  @Test
  void anEmptyOrUnknownSelectionIsInvalid() {
    assertRejected(open(List.of(), null), ErrorCode.INVALID_MESSAGE);
    assertRejected(open(List.of(UUID.randomUUID()), null), ErrorCode.INVALID_MESSAGE);
    assertRejected(open(List.of(fx.f1.id(), fx.f1.id()), null), ErrorCode.INVALID_MESSAGE);
    assertThat(fx.rounds.rounds).isEmpty();
  }

  @Test
  void revealingMakesTheRoundImmutableAndFreesItsFeatures() {
    UUID round = fx.openRound(fx.f1.id(), fx.f2.id());
    long version = fx.sessionVersion();
    fx.broadcaster.published.clear();

    assertThat(useCase.reveal(RoundFixture.SESSION, fx.facilitator, round))
        .isEqualTo(Outcome.CHANGED);

    assertThat(fx.rounds.rounds.get(round).status()).isEqualTo(RoundStatus.REVEALED);
    assertThat(fx.rounds.featuresInOpenRounds(RoundFixture.SESSION)).isEmpty();
    assertThat(fx.sessionVersion()).isEqualTo(version + 1);
    assertThat(fx.broadcaster.published).containsExactly(RoundFixture.SESSION);
  }

  @Test
  void revealingAgainIsAnAcceptedNoOp() {
    UUID round = fx.openRound(fx.f1.id());
    useCase.reveal(RoundFixture.SESSION, fx.facilitator, round);
    long version = fx.sessionVersion();
    fx.broadcaster.published.clear();

    assertThat(useCase.reveal(RoundFixture.SESSION, fx.facilitator, round))
        .isEqualTo(Outcome.UNCHANGED);
    assertThat(fx.sessionVersion()).isEqualTo(version);
    assertThat(fx.broadcaster.published).isEmpty();
  }

  @Test
  void anUnknownRoundCannotBeRevealed() {
    assertRejected(
        useCase.reveal(RoundFixture.SESSION, fx.facilitator, UUID.randomUUID()),
        ErrorCode.INVALID_MESSAGE);
  }

  @Test
  void revealingRemovesTheReviewMarkOfItsFeaturesOnly() {
    fx.features.update(fx.f1.markForReview("à discuter"));
    fx.features.update(fx.f2.markForReview(null));
    UUID round = fx.openRound(fx.f1.id());

    useCase.reveal(RoundFixture.SESSION, fx.facilitator, round);

    assertThat(fx.features.features.get(fx.f1.id()).markedForReview()).isFalse();
    assertThat(fx.features.features.get(fx.f1.id()).reviewReason()).isNull();
    assertThat(fx.features.features.get(fx.f2.id()).markedForReview()).isTrue();
  }

  @Test
  void aRoundCanBeRelaunchedOnAnyFeaturesOfARevealedRound() {
    UUID first = fx.openRound(fx.f1.id(), fx.f2.id());
    useCase.reveal(RoundFixture.SESSION, fx.facilitator, first);

    assertThat(open(List.of(fx.f2.id()), first)).isEqualTo(Outcome.CHANGED);

    var second = fx.rounds.findAll(RoundFixture.SESSION).get(1);
    assertThat(second.number()).isEqualTo(2);
    assertThat(second.previousRoundId()).isEqualTo(first);
    assertThat(second.featureIds()).containsExactly(fx.f2.id());
    assertThat(fx.rounds.rounds.get(first).status()).isEqualTo(RoundStatus.REVEALED);
  }

  @Test
  void aRelaunchNeedsARevealedRoundAndFeaturesOfIt() {
    UUID open = fx.openRound(fx.f1.id());
    assertRejected(open(List.of(fx.f2.id()), open), ErrorCode.INVALID_MESSAGE);
    assertRejected(open(List.of(fx.f2.id()), UUID.randomUUID()), ErrorCode.INVALID_MESSAGE);
    useCase.reveal(RoundFixture.SESSION, fx.facilitator, open);
    assertRejected(open(List.of(fx.f2.id()), open), ErrorCode.INVALID_MESSAGE);
    assertThat(NONE).isEmpty();
  }

  @Test
  void twoRoundsCanBeOpenOnDisjointFeatures() {
    fx.openRound(fx.f1.id());
    assertThat(open(List.of(fx.f2.id()), null)).isEqualTo(Outcome.CHANGED);
    assertThat(fx.rounds.featuresInOpenRounds(RoundFixture.SESSION))
        .containsExactlyInAnyOrder(fx.f1.id(), fx.f2.id());
  }
}
