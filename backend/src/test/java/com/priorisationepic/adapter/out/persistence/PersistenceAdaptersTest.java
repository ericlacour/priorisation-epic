package com.priorisationepic.adapter.out.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.PostgresTestBase;
import com.priorisationepic.application.ChangeLogRepository;
import com.priorisationepic.application.ChangeLogWriter;
import com.priorisationepic.application.FeatureRepository;
import com.priorisationepic.application.ParticipantRepository;
import com.priorisationepic.application.RoundRepository;
import com.priorisationepic.application.SessionRepository;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.Role;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.Tokens;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/** Adaptateurs de persistance : lectures SQL et historique JPA, contre PostgreSQL. */
@SpringBootTest
class PersistenceAdaptersTest extends PostgresTestBase {

  private static final String ID = "k3Jx9QvT2mLpZ8wR4nYb7A";
  private static final SessionId SESSION = new SessionId(ID);
  private static final UUID ALICE = UUID.randomUUID();

  @Autowired JdbcTemplate jdbc;
  @Autowired SessionRepository sessions;
  @Autowired ParticipantRepository participants;
  @Autowired FeatureRepository features;
  @Autowired RoundRepository rounds;
  @Autowired ChangeLogRepository changeLog;
  @Autowired ChangeLogWriter writer;
  @Autowired TransactionTemplate transaction;

  @BeforeEach
  void seed() {
    jdbc.update("delete from session");
    jdbc.update(
        "insert into session (session_id, animation_token_hash, name, status, method,"
            + " method_version, scale_type, scale_max, created_at, created_by_pseudo)"
            + " values (?, ?, 'Atelier', 'PREPARATION', 'WSJF', 1, 'CONTINUOUS', 10, now(), 'Alice')",
        ID,
        Tokens.hash("animation"));
    jdbc.update(
        "insert into participant (id, session_id, pseudo, role, participant_token_hash, joined_at,"
            + " last_seen_at) values (?, ?, 'Alice', 'FACILITATOR', ?, now(), now() - interval '1 day')",
        ALICE,
        ID,
        Tokens.hash("alice"));
  }

  @Test
  void sessionsExistAndCheckTheAnimationToken() {
    assertThat(sessions.exists(SESSION)).isTrue();
    assertThat(sessions.exists(new SessionId("A".repeat(22)))).isFalse();
    assertThat(sessions.animationTokenMatches(SESSION, "animation")).isTrue();
    assertThat(sessions.animationTokenMatches(SESSION, "other")).isFalse();
    assertThat(sessions.animationTokenMatches(new SessionId("A".repeat(22)), "animation"))
        .isFalse();
  }

  @Test
  void participantsAreFoundByTokenWithinTheirSessionOnly() {
    var found = participants.findByToken(SESSION, "alice");
    assertThat(found).isPresent();
    assertThat(found.get().id()).isEqualTo(ALICE);
    assertThat(found.get().pseudo()).isEqualTo(Pseudo.of("Alice"));
    assertThat(found.get().role()).isEqualTo(Role.FACILITATOR);
    assertThat(participants.findByToken(SESSION, "bob")).isEmpty();
    assertThat(participants.findByToken(new SessionId("A".repeat(22)), "alice")).isEmpty();
  }

  @Test
  void lastSeenIsUpdated() {
    Instant at = Instant.parse("2026-10-12T08:00:00Z");
    participants.updateLastSeen(ALICE, at);
    Timestamp stored =
        jdbc.queryForObject(
            "select last_seen_at from participant where id = ?", Timestamp.class, ALICE);
    assertThat(stored.toInstant()).isEqualTo(at);
  }

  @Test
  void countsActiveFeaturesOnly() {
    assertThat(features.countActive(SESSION)).isZero();
    jdbc.update(
        "insert into feature (id, session_id, external_id, title) values (?, ?, 'F-1', 'T')",
        UUID.randomUUID(),
        ID);
    jdbc.update(
        "insert into feature (id, session_id, external_id, title, deleted_at)"
            + " values (?, ?, 'F-2', 'T', now())",
        UUID.randomUUID(),
        ID);
    assertThat(features.countActive(SESSION)).isEqualTo(1);
  }

  @Test
  void detectsAnOpenRound() {
    assertThat(rounds.hasOpenRound(SESSION)).isFalse();
    jdbc.update(
        "insert into voting_round (id, session_id, number, status, opened_at)"
            + " values (?, ?, 1, 'REVEALED', now())",
        UUID.randomUUID(),
        ID);
    assertThat(rounds.hasOpenRound(SESSION)).isFalse();
    jdbc.update(
        "insert into voting_round (id, session_id, number, status, opened_at)"
            + " values (?, ?, 2, 'OPEN', now())",
        UUID.randomUUID(),
        ID);
    assertThat(rounds.hasOpenRound(SESSION)).isTrue();
  }

  @Test
  void listsTheFeaturesOfTheOpenRoundOnly() {
    UUID inOpenRound = UUID.randomUUID();
    UUID inRevealedRound = UUID.randomUUID();
    for (UUID feature : List.of(inOpenRound, inRevealedRound)) {
      jdbc.update(
          "insert into feature (id, session_id, external_id, title) values (?, ?, ?, 'T')",
          feature,
          ID,
          feature.toString().substring(0, 8));
    }
    UUID open = UUID.randomUUID();
    UUID revealed = UUID.randomUUID();
    jdbc.update(
        "insert into voting_round (id, session_id, number, status, opened_at)"
            + " values (?, ?, 1, 'REVEALED', now())",
        revealed,
        ID);
    jdbc.update(
        "insert into voting_round (id, session_id, number, status, opened_at)"
            + " values (?, ?, 2, 'OPEN', now())",
        open,
        ID);
    assertThat(rounds.featuresInOpenRound(SESSION)).isEmpty();
    jdbc.update(
        "insert into round_feature (round_id, feature_id) values (?, ?)",
        revealed,
        inRevealedRound);
    jdbc.update(
        "insert into round_feature (round_id, feature_id) values (?, ?)", open, inOpenRound);

    assertThat(rounds.featuresInOpenRound(SESSION)).containsExactly(inOpenRound);
  }

  @Test
  void theChangeLogNeedsTheTransactionOfTheChange() {
    assertThatThrownBy(
            () -> writer.valueChanged(SESSION, Pseudo.of("Alice"), UUID.randomUUID(), "bv", 1, 2))
        .hasMessageContaining("transaction");
    assertThat(jdbc.queryForObject("select count(*) from change_log", Integer.class)).isZero();
  }

  @Test
  void aValueChangeIsWrittenAsJsonInTheTransaction() {
    UUID feature = UUID.randomUUID();
    transaction.executeWithoutResult(
        status -> writer.valueChanged(SESSION, Pseudo.of("Alice"), feature, "bv", 5, 8));

    Map<String, Object> row = jdbc.queryForMap("select * from change_log");
    assertThat(row)
        .containsEntry("session_id", ID)
        .containsEntry("author_pseudo", "Alice")
        .containsEntry("entity_type", "FEATURE")
        .containsEntry("entity_id", feature.toString())
        .containsEntry("action", "VALUE_CHANGE")
        .containsEntry("field", "bv");
    assertThat(row.get("old_value").toString()).isEqualTo("5");
    assertThat(row.get("new_value").toString()).isEqualTo("8");
    assertThat(row.get("old_value").getClass().getSimpleName()).isEqualTo("PGobject");
  }

  @Test
  void aScaleChangeIsWrittenAsJsonObjects() {
    transaction.executeWithoutResult(
        status ->
            writer.scaleChanged(SESSION, Pseudo.of("Alice"), "CONTINUOUS", 10, "FIBONACCI", 20));

    List<Map<String, Object>> rows = jdbc.queryForList("select * from change_log");
    assertThat(rows).hasSize(1);
    assertThat(rows.getFirst().get("new_value").toString())
        .contains("\"FIBONACCI\"")
        .contains("20");
    assertThat(rows.getFirst().get("field")).isNull();
  }

  @Test
  void theEntryIsRolledBackWithTheChange() {
    assertThatThrownBy(
            () ->
                transaction.executeWithoutResult(
                    status -> {
                      writer.valueChanged(
                          SESSION, Pseudo.of("Alice"), UUID.randomUUID(), "bv", 1, 2);
                      throw new IllegalStateException("rollback");
                    }))
        .hasMessage("rollback");
    assertThat(jdbc.queryForObject("select count(*) from change_log", Integer.class)).isZero();
  }
}
