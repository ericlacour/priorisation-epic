package com.priorisationepic.domain.round;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.domain.method.InvalidValueException;
import com.priorisationepic.domain.method.MethodDefinition;
import com.priorisationepic.domain.method.UnknownCriterionException;
import com.priorisationepic.domain.method.WsjfMethod;
import com.priorisationepic.domain.round.RoundResults.FeatureResult;
import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.testmethod.FakeTwoCriteriaMethod;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RoundResultsTest {

  private static final MethodDefinition WSJF = new WsjfMethod().definition();
  private static final Instant NOW = Instant.parse("2026-10-12T08:00:00Z");
  private final UUID round = UUID.randomUUID();
  private final UUID feature = UUID.randomUUID();
  private final UUID eric = UUID.randomUUID();
  private final UUID alice = UUID.randomUUID();
  private final UUID bob = UUID.randomUUID();

  private Vote vote(UUID who, Map<String, Integer> values) {
    return new Vote(round, feature, who, values, NOW);
  }

  private FeatureResult results(List<Vote> votes) {
    return RoundResults.of(WSJF, feature, votes, List.of(eric, alice, bob));
  }

  @Test
  void minimumAndMaximumIgnoreCriteriaLeftEmpty() {
    Map<String, Integer> aliceValues = new HashMap<>();
    aliceValues.put("bv", 9);
    aliceValues.put("tc", 5);
    aliceValues.put("rrOe", 3);
    aliceValues.put("js", null);
    FeatureResult r =
        results(
            List.of(
                vote(eric, Map.of("bv", 8, "tc", 5, "rrOe", 3, "js", 4)),
                vote(alice, aliceValues)));
    assertThat(r.min()).containsEntry("bv", 8).containsEntry("js", 4);
    assertThat(r.max()).containsEntry("bv", 9).containsEntry("js", 4);
    assertThat(r.unanimous().get("js")).isEqualTo(4);
    assertThat(r.unanimous().get("bv")).isNull();
    assertThat(r.unanimous().get("tc")).isEqualTo(5);
  }

  @Test
  void aCriterionWithoutAnyValueIsEmpty() {
    FeatureResult r = results(List.of(vote(eric, Map.of("bv", 8))));
    assertThat(r.min().get("js")).isNull();
    assertThat(r.max().get("js")).isNull();
    assertThat(r.unanimous().get("js")).isNull();
    assertThat(r.min()).containsKeys("bv", "tc", "rrOe", "js");
  }

  @Test
  void aSpreadIsLargeOnlyAboveThree() {
    assertThat(
            results(List.of(vote(eric, Map.of("bv", 2)), vote(alice, Map.of("bv", 5))))
                .largeSpread())
        .isEmpty();
    assertThat(
            results(List.of(vote(eric, Map.of("bv", 2)), vote(alice, Map.of("bv", 6))))
                .largeSpread())
        .containsExactly("bv");
  }

  @Test
  void nonVotersAreThoseWithoutAnyValue() {
    FeatureResult r = results(List.of(vote(eric, Map.of("bv", 1)), vote(alice, Map.of())));
    assertThat(r.nonVoters()).containsExactly(alice, bob);
    assertThat(r.votes()).hasSize(1);
  }

  @Test
  void aVoteWithOneCriterionCountsAsScored() {
    Vote partial = vote(alice, Map.of("js", 3));
    assertThat(partial.scored()).isTrue();
    assertThat(vote(alice, Map.of()).scored()).isFalse();
    assertThat(RoundResults.completedCount(alice, List.of(partial, vote(eric, Map.of("bv", 1)))))
        .isEqualTo(1);
    assertThat(RoundResults.completedCount(bob, List.of(partial))).isZero();
  }

  @Test
  void noVoteAtAllGivesEmptyResults() {
    FeatureResult r = results(List.of());
    assertThat(r.votes()).isEmpty();
    assertThat(r.nonVoters()).containsExactly(eric, alice, bob);
    assertThat(r.largeSpread()).isEmpty();
  }

  @Test
  void usesTheCriteriaOfAnyMethod() {
    MethodDefinition fake = new FakeTwoCriteriaMethod().definition();
    List<String> keys = fake.criterionKeys();
    Vote a = vote(eric, Map.of(keys.get(0), 1, keys.get(1), 9));
    Vote b = vote(alice, Map.of(keys.get(0), 1, keys.get(1), 2));
    FeatureResult r = RoundResults.of(fake, feature, List.of(a, b), List.of(eric, alice));
    assertThat(r.min().keySet()).containsExactlyElementsOf(keys);
    assertThat(r.unanimous().get(keys.get(0))).isEqualTo(1);
    assertThat(r.largeSpread()).containsExactly(keys.get(1));
  }

  @Test
  void castDropsEmptyValuesAndChecksKeysAndScale() {
    Scale scale = Scale.defaultScale();
    Map<String, Integer> requested = new HashMap<>();
    requested.put("bv", 8);
    requested.put("js", null);
    Vote cast = Vote.cast(round, feature, eric, requested, WSJF, scale, NOW);
    assertThat(cast.values()).containsOnlyKeys("bv");
    assertThatThrownBy(() -> Vote.cast(round, feature, eric, Map.of("zz", 1), WSJF, scale, NOW))
        .isInstanceOf(UnknownCriterionException.class);
    assertThatThrownBy(() -> Vote.cast(round, feature, eric, Map.of("bv", 11), WSJF, scale, NOW))
        .isInstanceOf(InvalidValueException.class);
    assertThat(Vote.cast(round, feature, eric, Map.of(), WSJF, scale, NOW).scored()).isFalse();
  }
}
