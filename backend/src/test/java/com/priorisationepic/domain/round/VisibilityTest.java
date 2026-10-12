package com.priorisationepic.domain.round;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.method.Criteria;
import com.priorisationepic.domain.method.RankedFeature;
import com.priorisationepic.domain.method.Ranking;
import com.priorisationepic.domain.method.WsjfMethod;
import com.priorisationepic.domain.scale.Scale;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class VisibilityTest {

  private static final SessionId SESSION = new SessionId("k3Jx9QvT2mLpZ8wR4nYb7A");
  private static final Instant NOW = Instant.parse("2026-10-12T08:00:00Z");
  private final WsjfMethod wsjf = new WsjfMethod();
  private final UUID alice = UUID.randomUUID();
  private final UUID bob = UUID.randomUUID();

  private Feature feature(String id, int bv) {
    Criteria none = Criteria.empty(wsjf.definition());
    return Feature.create(UUID.randomUUID(), SESSION, id, "T", null, none, Scale.defaultScale())
        .withCriteriaChanges(Map.of("bv", bv, "tc", 1, "rrOe", 1, "js", 1), Scale.defaultScale());
  }

  private VotingRound open(UUID... features) {
    return VotingRound.open(UUID.randomUUID(), SESSION, 1, List.of(features), null, NOW);
  }

  @Test
  void aParticipantDoesNotSeeTheValuesOfFeaturesInAnOpenRound() {
    UUID inRound = UUID.randomUUID();
    Visibility v = new Visibility(false, alice, Set.of(inRound));
    assertThat(v.masks(inRound)).isTrue();
    assertThat(v.votingInProgress(inRound)).isTrue();
    assertThat(v.masks(UUID.randomUUID())).isFalse();
    assertThat(v.seesRevealedVotesOf(inRound)).isFalse();
  }

  @Test
  void theFacilitatorSeesTheRetainedValuesButStillNotTheVotes() {
    UUID inRound = UUID.randomUUID();
    Visibility v = new Visibility(true, alice, Set.of(inRound));
    assertThat(v.masks(inRound)).isFalse();
    assertThat(v.votingInProgress(inRound)).isTrue();
    VotingRound round = open(inRound);
    assertThat(v.sees(new Vote(round.id(), inRound, bob, Map.of("bv", 3), NOW), round)).isFalse();
    assertThat(v.sees(new Vote(round.id(), inRound, alice, Map.of("bv", 3), NOW), round)).isTrue();
  }

  @Test
  void duringAnOpenRoundEveryoneSeesOnlyTheirOwnVotesAndNoResults() {
    UUID f = UUID.randomUUID();
    VotingRound round = open(f);
    Visibility asAlice = new Visibility(false, alice, Set.of(f));
    Vote mine = new Vote(round.id(), f, alice, Map.of("bv", 1), NOW);
    Vote others = new Vote(round.id(), f, bob, Map.of("bv", 2), NOW);
    assertThat(asAlice.sees(mine, round)).isTrue();
    assertThat(asAlice.sees(others, round)).isFalse();
    assertThat(asAlice.seesResults(round)).isFalse();
  }

  @Test
  void aConsultationWithoutRecipientSeesNoVoteWhileOpen() {
    UUID f = UUID.randomUUID();
    VotingRound round = open(f);
    Visibility anonymous = new Visibility(false, null, Set.of(f));
    assertThat(anonymous.sees(new Vote(round.id(), f, bob, Map.of("bv", 2), NOW), round)).isFalse();
  }

  @Test
  void onceRevealedEveryoneSeesEverything() {
    UUID f = UUID.randomUUID();
    VotingRound revealed = open(f).reveal(NOW);
    Visibility asAlice = new Visibility(false, alice, Set.of());
    assertThat(asAlice.sees(new Vote(revealed.id(), f, bob, Map.of("bv", 2), NOW), revealed))
        .isTrue();
    assertThat(asAlice.seesResults(revealed)).isTrue();
  }

  @Test
  void maskedFeaturesGoToTheEndOfTheTableForAParticipant() {
    Feature best = feature("F-1", 10);
    Feature middle = feature("F-2", 5);
    Feature worst = feature("F-3", 1);
    List<RankedFeature> ranked =
        Ranking.rank(wsjf, Scale.defaultScale(), List.of(best, middle, worst));
    assertThat(ranked.stream().map(r -> r.feature().externalId()))
        .containsExactly("F-1", "F-2", "F-3");

    Visibility participant = new Visibility(false, alice, Set.of(best.id()));
    assertThat(participant.arrange(ranked).stream().map(r -> r.feature().externalId()))
        .containsExactly("F-2", "F-3", "F-1");
    Visibility facilitator = new Visibility(true, alice, Set.of(best.id()));
    assertThat(facilitator.arrange(ranked)).isEqualTo(ranked);
  }
}
