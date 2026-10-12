package com.priorisationepic.application;

import static com.priorisationepic.application.RoundFixture.assertRejected;
import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.application.VoteUseCase.Cast;
import com.priorisationepic.domain.round.Vote;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class VoteUseCaseTest {

  private final RoundFixture fx = new RoundFixture();
  private final VoteUseCase useCase = fx.voteUseCase();
  private final UUID round = fx.openRound(fx.f1.id());

  private Outcome cast(Actor who, Map<String, Integer> criteria) {
    return useCase.cast(RoundFixture.SESSION, who, new Cast(round, fx.f1.id(), criteria));
  }

  private Vote voteOf(UUID who) {
    return fx.rounds.votes.stream()
        .filter(v -> v.participantId().equals(who))
        .findFirst()
        .orElse(null);
  }

  @Test
  void anyMemberVotesTheFacilitatorIncluded() {
    assertThat(cast(fx.aliceActor, Map.of("bv", 8, "tc", 5))).isEqualTo(Outcome.CHANGED);
    assertThat(cast(fx.facilitator, Map.of("bv", 3))).isEqualTo(Outcome.CHANGED);
    assertThat(voteOf(fx.alice).values()).containsOnly(Map.entry("bv", 8), Map.entry("tc", 5));
    assertThat(voteOf(fx.eric).values()).containsOnly(Map.entry("bv", 3));
  }

  @Test
  void aVoteReplacesThePreviousOneAndPublishes() {
    cast(fx.aliceActor, Map.of("bv", 8, "tc", 5));
    long version = fx.sessionVersion();
    fx.broadcaster.published.clear();

    cast(fx.aliceActor, Map.of("bv", 9));

    assertThat(voteOf(fx.alice).values()).containsOnly(Map.entry("bv", 9));
    assertThat(fx.sessionVersion()).isEqualTo(version + 1);
    assertThat(fx.broadcaster.published).containsExactly(RoundFixture.SESSION);
  }

  @Test
  void aCriterionLeftEmptyIsNoOpinionAndStillCountsAsScored() {
    Map<String, Integer> values = new HashMap<>();
    values.put("bv", 8);
    values.put("js", null);
    cast(fx.aliceActor, values);
    assertThat(voteOf(fx.alice).values()).containsOnlyKeys("bv");
    assertThat(voteOf(fx.alice).scored()).isTrue();
  }

  @Test
  void anEmptyVoteClearsTheVote() {
    cast(fx.aliceActor, Map.of("bv", 8));
    assertThat(cast(fx.aliceActor, Map.of())).isEqualTo(Outcome.CHANGED);
    assertThat(voteOf(fx.alice)).isNull();
  }

  @Test
  void anIdenticalVoteChangesNothing() {
    cast(fx.aliceActor, Map.of("bv", 8));
    long version = fx.sessionVersion();
    fx.broadcaster.published.clear();
    assertThat(cast(fx.aliceActor, Map.of("bv", 8))).isEqualTo(Outcome.UNCHANGED);
    assertThat(fx.sessionVersion()).isEqualTo(version);
    assertThat(fx.broadcaster.published).isEmpty();
  }

  @Test
  void valuesAreCheckedAgainstTheScaleAndTheMethod() {
    assertRejected(cast(fx.aliceActor, Map.of("bv", 11)), ErrorCode.INVALID_VALUE);
    assertRejected(cast(fx.aliceActor, Map.of("zz", 1)), ErrorCode.UNKNOWN_CRITERION);
    assertThat(fx.rounds.votes).isEmpty();
  }

  @Test
  void aRevealedRoundRefusesVotes() {
    fx.roundUseCase().reveal(RoundFixture.SESSION, fx.facilitator, round);
    assertRejected(cast(fx.aliceActor, Map.of("bv", 8)), ErrorCode.ROUND_REVEALED);
    assertThat(fx.rounds.votes).isEmpty();
  }

  @Test
  void aFeatureOutsideTheRoundOrAnUnknownRoundIsInvalid() {
    assertRejected(
        useCase.cast(
            RoundFixture.SESSION, fx.aliceActor, new Cast(round, fx.f2.id(), Map.of("bv", 1))),
        ErrorCode.INVALID_MESSAGE);
    assertRejected(
        useCase.cast(
            RoundFixture.SESSION,
            fx.aliceActor,
            new Cast(UUID.randomUUID(), fx.f1.id(), Map.of("bv", 1))),
        ErrorCode.INVALID_MESSAGE);
  }

  @Test
  void aClosedSessionRefusesVotes() {
    fx.sessions.put(fx.sessions.find(RoundFixture.SESSION).orElseThrow().close());
    assertRejected(cast(fx.aliceActor, Map.of("bv", 8)), ErrorCode.SESSION_CLOSED);
  }
}
