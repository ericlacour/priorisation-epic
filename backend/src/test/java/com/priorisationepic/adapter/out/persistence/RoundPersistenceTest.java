package com.priorisationepic.adapter.out.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.PostgresTestBase;
import com.priorisationepic.application.FeatureRepository;
import com.priorisationepic.application.ParticipantRepository;
import com.priorisationepic.application.RoundRepository;
import com.priorisationepic.application.SessionRepository;
import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.Role;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.Tokens;
import com.priorisationepic.domain.method.Criteria;
import com.priorisationepic.domain.method.MethodDefinition;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.round.RoundStatus;
import com.priorisationepic.domain.round.Vote;
import com.priorisationepic.domain.round.VotingRound;
import com.priorisationepic.domain.scale.Scale;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/** Persistance des tours de vote et des votes, contre PostgreSQL. */
@SpringBootTest
class RoundPersistenceTest extends PostgresTestBase {

  private static final SessionId ID = new SessionId("k3Jx9QvT2mLpZ8wR4nYb7A");
  private static final Instant T0 = Instant.parse("2026-10-12T08:00:00Z");
  private static final MethodDefinition WSJF =
      MethodRegistry.standard().defaultMethod().definition();

  @Autowired JdbcTemplate jdbc;
  @Autowired SessionRepository sessions;
  @Autowired ParticipantRepository participants;
  @Autowired FeatureRepository features;
  @Autowired RoundRepository rounds;

  private UUID eric;
  private UUID f1;
  private UUID f2;

  @BeforeEach
  void seed() {
    jdbc.update("delete from session");
    sessions.insert(
        Session.create(
            MethodRegistry.standard(),
            ID,
            "Atelier",
            null,
            Tokens.hash("a"),
            Pseudo.of("eric"),
            T0));
    eric = UUID.randomUUID();
    participants.insert(
        Participant.join(eric, ID, Pseudo.of("eric"), Role.FACILITATOR, Tokens.hash("e"), T0));
    f1 = insertFeature("F-1");
    f2 = insertFeature("F-2");
  }

  private UUID insertFeature(String externalId) {
    UUID id = UUID.randomUUID();
    features.insert(
        Feature.create(id, ID, externalId, "T", null, Criteria.empty(WSJF), Scale.defaultScale()));
    return id;
  }

  private VotingRound open(int number, UUID previous, UUID... featureIds) {
    VotingRound round =
        VotingRound.open(UUID.randomUUID(), ID, number, List.of(featureIds), previous, T0);
    rounds.insert(round);
    return round;
  }

  @Test
  void aRoundIsStoredWithItsFeaturesAndReadBack() {
    assertThat(rounds.nextNumber(ID)).isEqualTo(1);
    assertThat(rounds.hasOpenRound(ID)).isFalse();
    VotingRound round = open(1, null, f1, f2);

    assertThat(rounds.hasOpenRound(ID)).isTrue();
    assertThat(rounds.nextNumber(ID)).isEqualTo(2);
    VotingRound read = rounds.find(ID, round.id()).orElseThrow();
    assertThat(read.number()).isEqualTo(1);
    assertThat(read.status()).isEqualTo(RoundStatus.OPEN);
    assertThat(read.featureIds()).containsExactlyInAnyOrder(f1, f2);
    assertThat(read.previousRoundId()).isNull();
    assertThat(read.openedAt()).isEqualTo(T0);
    assertThat(rounds.featuresInOpenRounds(ID)).containsExactlyInAnyOrder(f1, f2);
    assertThat(rounds.find(ID, UUID.randomUUID())).isEmpty();
    assertThat(rounds.find(new SessionId("z".repeat(22)), round.id())).isEmpty();
  }

  @Test
  void revealingKeepsTheRoundAndFreesItsFeatures() {
    VotingRound first = open(1, null, f1, f2);
    rounds.markRevealed(first.id(), T0.plusSeconds(60));

    VotingRound read = rounds.find(ID, first.id()).orElseThrow();
    assertThat(read.status()).isEqualTo(RoundStatus.REVEALED);
    assertThat(read.revealedAt()).isEqualTo(T0.plusSeconds(60));
    assertThat(rounds.hasOpenRound(ID)).isFalse();
    assertThat(rounds.featuresInOpenRounds(ID)).isEmpty();

    VotingRound second = open(2, first.id(), f2);
    assertThat(rounds.findAll(ID)).extracting(VotingRound::number).containsExactly(1, 2);
    assertThat(rounds.find(ID, second.id()).orElseThrow().previousRoundId()).isEqualTo(first.id());
  }

  @Test
  void aVoteIsReplacedAndAnEmptyVoteRemovesIt() {
    VotingRound round = open(1, null, f1);
    rounds.saveVote(new Vote(round.id(), f1, eric, Map.of("bv", 8, "tc", 5), T0));
    rounds.saveVote(new Vote(round.id(), f1, eric, Map.of("bv", 9), T0.plusSeconds(5)));

    List<Vote> votes = rounds.findVotes(ID);
    assertThat(votes).hasSize(1);
    assertThat(votes.get(0).values()).containsOnly(Map.entry("bv", 9));
    assertThat(votes.get(0).participantId()).isEqualTo(eric);

    rounds.saveVote(new Vote(round.id(), f1, eric, Map.of(), T0.plusSeconds(9)));
    assertThat(rounds.findVotes(ID)).isEmpty();
    assertThat(jdbc.queryForObject("select count(*) from vote_criterion_value", Integer.class))
        .isZero();
  }

  @Test
  void deletingTheSessionDeletesRoundsAndVotes() {
    VotingRound round = open(1, null, f1);
    rounds.saveVote(new Vote(round.id(), f1, eric, Map.of("bv", 1), T0));
    jdbc.update("delete from session where session_id = ?", ID.value());
    assertThat(jdbc.queryForObject("select count(*) from voting_round", Integer.class)).isZero();
    assertThat(jdbc.queryForObject("select count(*) from vote", Integer.class)).isZero();
  }
}
