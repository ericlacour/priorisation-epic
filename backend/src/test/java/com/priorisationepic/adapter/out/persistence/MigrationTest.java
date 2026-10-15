package com.priorisationepic.adapter.out.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.PostgresTestBase;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

/** Les migrations Flyway s'appliquent et le schéma porte les contraintes de data-model.md. */
@SpringBootTest
class MigrationTest extends PostgresTestBase {

  private static final String SESSION_ID = "AAAAAAAAAAAAAAAAAAAAAA";

  @Autowired JdbcTemplate jdbc;

  @BeforeEach
  void cleanDatabase() {
    jdbc.update("delete from session");
  }

  @Test
  void flywayAppliedEveryMigration() {
    String version =
        jdbc.queryForObject(
            "select version from flyway_schema_history where success order by installed_rank desc limit 1",
            String.class);
    assertThat(version).isEqualTo("3");
  }

  @Test
  void createsEveryTableOfTheDataModel() {
    List<String> tables =
        jdbc.queryForList(
            "select table_name from information_schema.tables where table_schema = current_schema()",
            String.class);
    assertThat(tables)
        .contains(
            "session",
            "participant",
            "feature",
            "feature_criterion_value",
            "voting_round",
            "round_feature",
            "vote",
            "vote_criterion_value",
            "change_log",
            "import_preview");
  }

  @Test
  void featureHasNoColumnPerCriterion() {
    List<String> columns =
        jdbc.queryForList(
            "select column_name from information_schema.columns where table_name = 'feature'",
            String.class);
    assertThat(columns).doesNotContain("bv", "tc", "rr_oe", "js", "business_value", "job_size");
  }

  @Test
  void methodColumnAcceptsAnyMethodKey() {
    String id = insertSession("ZZZZZZZZZZZZZZZZZZZZZZ", "SAFE_NEW_METHOD");
    assertThat(id).isNotNull();
  }

  @Test
  void rejectsAnInvalidStatus() {
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "insert into session (session_id, animation_token_hash, name, status, method,"
                        + " method_version, scale_type, scale_max, created_at, created_by_pseudo)"
                        + " values ('BBBBBBBBBBBBBBBBBBBBBB', 'h', 'S', 'NOPE', 'WSJF', 1,"
                        + " 'CONTINUOUS', 10, now(), 'a')"))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void pseudoIsUniquePerSessionIgnoringCase() {
    insertSession(SESSION_ID, "WSJF");
    insertParticipant("Alice");
    assertThatThrownBy(() -> insertParticipant("ALICE"))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void externalIdIsUniquePerSessionIgnoringCaseButNotWhenDeleted() {
    insertSession("CCCCCCCCCCCCCCCCCCCCCC", "WSJF");
    UUID first = insertFeature("CCCCCCCCCCCCCCCCCCCCCC", "F-1", false);
    assertThatThrownBy(() -> insertFeature("CCCCCCCCCCCCCCCCCCCCCC", "f-1", false))
        .isInstanceOf(DataIntegrityViolationException.class);
    jdbc.update("update feature set deleted_at = now() where id = ?", first);
    insertFeature("CCCCCCCCCCCCCCCCCCCCCC", "f-1", false);
  }

  @Test
  void criterionValueMustBeAtLeastOne() {
    insertSession("DDDDDDDDDDDDDDDDDDDDDD", "WSJF");
    UUID feature = insertFeature("DDDDDDDDDDDDDDDDDDDDDD", "F-1", false);
    jdbc.update(
        "insert into feature_criterion_value (feature_id, criterion_key, value) values (?, 'bv', 1)",
        feature);
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "insert into feature_criterion_value (feature_id, criterion_key, value)"
                        + " values (?, 'tc', 0)",
                    feature))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void aVoteIsUniquePerRoundFeatureAndParticipant() {
    String session = "EEEEEEEEEEEEEEEEEEEEEE";
    insertSession(session, "WSJF");
    UUID feature = insertFeature(session, "F-1", false);
    UUID participant = UUID.randomUUID();
    jdbc.update(
        "insert into participant (id, session_id, pseudo, role, participant_token_hash, joined_at,"
            + " last_seen_at) values (?, ?, 'p', 'FACILITATOR', 'h', now(), now())",
        participant,
        session);
    UUID round = UUID.randomUUID();
    jdbc.update(
        "insert into voting_round (id, session_id, number, status, opened_at)"
            + " values (?, ?, 1, 'OPEN', now())",
        round,
        session);
    String insertVote =
        "insert into vote (id, round_id, feature_id, participant_id, updated_at)"
            + " values (?, ?, ?, ?, now())";
    jdbc.update(insertVote, UUID.randomUUID(), round, feature, participant);
    assertThatThrownBy(
            () -> jdbc.update(insertVote, UUID.randomUUID(), round, feature, participant))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void deletingASessionCascades() {
    String session = "FFFFFFFFFFFFFFFFFFFFFF";
    insertSession(session, "WSJF");
    insertFeature(session, "F-1", false);
    jdbc.update("delete from session where session_id = ?", session);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from feature where session_id = ?", Integer.class, session))
        .isZero();
  }

  private String insertSession(String id, String method) {
    jdbc.update(
        "insert into session (session_id, animation_token_hash, name, status, method,"
            + " method_version, scale_type, scale_max, created_at, created_by_pseudo)"
            + " values (?, 'h', 'S', 'PREPARATION', ?, 1, 'CONTINUOUS', 10, now(), 'a')"
            + " on conflict do nothing",
        id,
        method);
    return id;
  }

  private void insertParticipant(String pseudo) {
    jdbc.update(
        "insert into participant (id, session_id, pseudo, role, participant_token_hash, joined_at,"
            + " last_seen_at) values (?, ?, ?, 'PARTICIPANT', 'h', now(), now())",
        UUID.randomUUID(),
        SESSION_ID,
        pseudo);
  }

  private UUID insertFeature(String session, String externalId, boolean deleted) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "insert into feature (id, session_id, external_id, title, marked_for_review)"
            + " values (?, ?, ?, 'T', ?)",
        id,
        session,
        externalId,
        deleted);
    return id;
  }
}
