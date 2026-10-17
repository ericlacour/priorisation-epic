package com.priorisationepic.adapter.out.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.PostgresTestBase;
import com.priorisationepic.application.ChangeLogWriter;
import com.priorisationepic.application.FeatureRepository;
import com.priorisationepic.application.ParticipantRepository;
import com.priorisationepic.application.PseudoTakenException;
import com.priorisationepic.application.SessionNameTakenException;
import com.priorisationepic.application.SessionRepository;
import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.Role;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.SessionStatus;
import com.priorisationepic.domain.Tokens;
import com.priorisationepic.domain.method.Criteria;
import com.priorisationepic.domain.method.MethodDefinition;
import com.priorisationepic.domain.method.WsjfMethod;
import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.domain.scale.ScaleType;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/** Sessions, participants et fonctionnalités en SQL, contre PostgreSQL. */
@SpringBootTest
class SessionPersistenceTest extends PostgresTestBase {

  private static final SessionId ID = new SessionId("k3Jx9QvT2mLpZ8wR4nYb7A");
  private static final MethodDefinition WSJF = WsjfMethod.version1().definition();
  private static final Instant NOW = Instant.parse("2026-10-12T08:00:00Z");

  @Autowired JdbcTemplate jdbc;
  @Autowired SessionRepository sessions;
  @Autowired ParticipantRepository participants;
  @Autowired FeatureRepository features;
  @Autowired ChangeLogWriter changeLog;
  @Autowired TransactionTemplate transaction;

  @BeforeEach
  void reset() {
    jdbc.update("delete from session");
    sessions.insert(
        new Session(
            ID,
            "Atelier Q4",
            SessionStatus.PREPARATION,
            "WSJF",
            1,
            new Scale(ScaleType.CONTINUOUS, 12),
            NOW,
            Pseudo.of("Alice"),
            0),
        Tokens.hash("animation"));
  }

  private static Session session(SessionId id, String name) {
    return new Session(
        id,
        name,
        SessionStatus.PREPARATION,
        "WSJF",
        1,
        new Scale(ScaleType.CONTINUOUS, 12),
        NOW,
        Pseudo.of("Bob"),
        0);
  }

  @Test
  void theUniqueIndexRefusesASecondSessionUnderTheSameName() {
    // Deux créations simultanées : le contrôle du cas d'usage est passé, l'index unique tranche.
    SessionId other = new SessionId("BBBBBBBBBBBBBBBBBBBBBB");
    assertThat(sessions.findIdByNameKey(Session.nameKey(" ATELIER q4 "))).contains(ID);

    assertThatThrownBy(() -> sessions.insert(session(other, "atelier Q4"), Tokens.hash("a")))
        .isInstanceOf(SessionNameTakenException.class);
    assertThat(sessions.exists(other)).isFalse();
  }

  @Test
  void theUniqueIndexRefusesARenameToTheNameOfAnotherSession() {
    SessionId other = new SessionId("BBBBBBBBBBBBBBBBBBBBBB");
    sessions.insert(session(other, "Roadmap"), Tokens.hash("a"));

    assertThatThrownBy(
            () -> sessions.updateSettings(other, "ATELIER Q4", new Scale(ScaleType.CONTINUOUS, 12)))
        .isInstanceOf(SessionNameTakenException.class);
    sessions.updateSettings(other, "Roadmap 2", new Scale(ScaleType.CONTINUOUS, 12));
    assertThat(sessions.findIdByNameKey("roadmap 2")).contains(other);
  }

  private Feature feature(String externalId, Map<String, Integer> values) {
    return Feature.create(
        UUID.randomUUID(), ID, externalId, "Titre " + externalId, null, Criteria.of(WSJF, values));
  }

  // --- Sessions -------------------------------------------------------------------------------

  @Test
  void aSessionRoundTrips() {
    Session found = sessions.find(ID).orElseThrow();

    assertThat(found.name()).isEqualTo("Atelier Q4");
    assertThat(found.status()).isEqualTo(SessionStatus.PREPARATION);
    assertThat(found.method()).isEqualTo("WSJF");
    assertThat(found.methodVersion()).isEqualTo(1);
    assertThat(found.scale()).isEqualTo(new Scale(ScaleType.CONTINUOUS, 12));
    assertThat(found.createdAt()).isEqualTo(NOW);
    assertThat(found.createdBy().value()).isEqualTo("Alice");
    assertThat(sessions.exists(ID)).isTrue();
    assertThat(sessions.animationTokenMatches(ID, "animation")).isTrue();
    assertThat(sessions.animationTokenMatches(ID, "other")).isFalse();
    assertThat(sessions.find(new SessionId("A".repeat(22)))).isEmpty();
  }

  @Test
  void theSessionVersionIncrements() {
    sessions.incrementVersion(ID);
    sessions.incrementVersion(ID);

    assertThat(sessions.find(ID).orElseThrow().version()).isEqualTo(2);
  }

  @Test
  void theTokenHashIsStoredNotTheToken() {
    String stored =
        jdbc.queryForObject(
            "select animation_token_hash from session where session_id = ?",
            String.class,
            ID.value());

    assertThat(stored).isEqualTo(Tokens.hash("animation")).hasSize(64).doesNotContain("animation");
  }

  // --- Participants ---------------------------------------------------------------------------

  private Participant participant(String pseudo, Role role, String token) {
    return new Participant(
        UUID.randomUUID(),
        ID,
        Pseudo.of(pseudo),
        role,
        role == Role.PARTICIPANT ? "Architecte" : null,
        Tokens.hash(token),
        NOW,
        NOW.plusSeconds(5));
  }

  @Test
  void aParticipantRoundTripsByTokenPseudoAndId() {
    Participant bob = participant("Bob", Role.PARTICIPANT, "bob-token");
    participants.insert(bob);

    assertThat(participants.findById(bob.id())).contains(bob);
    assertThat(participants.findByPseudo(ID, Pseudo.of("BOB"))).contains(bob);
    assertThat(participants.findByToken(ID, "bob-token").orElseThrow().id()).isEqualTo(bob.id());
    assertThat(participants.findByToken(ID, "other")).isEmpty();
    assertThat(participants.findByToken(new SessionId("B".repeat(22)), "bob-token")).isEmpty();
  }

  @Test
  void aPseudoIsUniqueIgnoringCasePerSession() {
    participants.insert(participant("Bob", Role.PARTICIPANT, "t1"));

    assertThatThrownBy(() -> participants.insert(participant("bOB", Role.PARTICIPANT, "t2")))
        .isInstanceOf(PseudoTakenException.class);
  }

  @Test
  void theApplicationKeyDecidesUniquenessNotTheDatabaseCaseFolding() {
    participants.insert(participant("Alice", Role.PARTICIPANT, "t1"));

    // Lettres pleine chasse : le lower() de la base ne les replie pas, la clé de l'application oui.
    assertThatThrownBy(() -> participants.insert(participant("ＡＬＩＣＥ", Role.PARTICIPANT, "t2")))
        .isInstanceOf(PseudoTakenException.class);
    assertThat(participants.findByPseudo(ID, Pseudo.of("ＡＬＩＣＥ"))).isPresent();
    assertThat(
            jdbc.queryForObject(
                "select pseudo_key from participant where pseudo = 'Alice'", String.class))
        .isEqualTo("alice");
  }

  @Test
  void theDatabaseFallbackComputesTheSameKeyAsTheApplication() {
    // Insertion sans clé (outil, jeu de données) : le déclencheur la calcule comme
    // Pseudo.uniquenessKey.
    jdbc.update(
        "insert into participant (id, session_id, pseudo, role, participant_token_hash, joined_at,"
            + " last_seen_at) values (?, ?, ?, 'PARTICIPANT', 'h', now(), now())",
        UUID.randomUUID(),
        ID.value(),
        "ＡＬＩＣＥ");

    assertThat(participants.findByPseudo(ID, Pseudo.of("alice"))).isPresent();
  }

  @Test
  void aPseudoWhoseNormalFormIsLongIsStoredWithoutOverflow() {
    String pseudo = "\uFDFA".repeat(Pseudo.MAX_CODE_POINTS);

    participants.insert(participant(pseudo, Role.PARTICIPANT, "t1"));

    assertThat(participants.findByPseudo(ID, Pseudo.of(pseudo))).isPresent();
  }

  @Test
  void participantsAreListedInArrivalOrder() {
    Participant alice = participant("Alice", Role.FACILITATOR, "a");
    Participant bob =
        new Participant(
            UUID.randomUUID(),
            ID,
            Pseudo.of("Bob"),
            Role.PARTICIPANT,
            null,
            Tokens.hash("b"),
            NOW.plusSeconds(60),
            NOW.plusSeconds(60));
    participants.insert(bob);
    participants.insert(alice);

    assertThat(participants.list(ID))
        .extracting(p -> p.pseudo().value())
        .containsExactly("Alice", "Bob");
  }

  @Test
  void replacingATokenInvalidatesTheOldOne() {
    Participant bob = participant("Bob", Role.PARTICIPANT, "old");
    participants.insert(bob);

    participants.replaceToken(bob.id(), Tokens.hash("new"), NOW.plus(1, ChronoUnit.HOURS));

    assertThat(participants.findByToken(ID, "old")).isEmpty();
    assertThat(participants.findByToken(ID, "new")).isPresent();
    assertThat(participants.findById(bob.id()).orElseThrow().lastSeenAt())
        .isEqualTo(NOW.plus(1, ChronoUnit.HOURS));
  }

  // --- Fonctionnalités ------------------------------------------------------------------------

  @Test
  void aFeatureRoundTripsWithItsValuesByCriterionKey() {
    Feature f1 = feature("F-1", Map.of("bv", 8, "tc", 5, "rrOe", 3, "js", 4));
    features.insert(f1);

    Feature found = features.find(ID, f1.id(), WSJF).orElseThrow();

    assertThat(found).isEqualTo(f1);
    assertThat(found.criteria().get("rrOe")).isEqualTo(3);
    assertThat(
            jdbc.queryForList(
                "select criterion_key from feature_criterion_value where feature_id = ? order by 1",
                String.class,
                f1.id()))
        .containsExactly("bv", "js", "rrOe", "tc");
  }

  @Test
  void aMissingValueHasNoRow() {
    Feature f1 = feature("F-1", Map.of("bv", 8));
    features.insert(f1);

    assertThat(
            jdbc.queryForObject(
                "select count(*) from feature_criterion_value where feature_id = ?",
                Integer.class,
                f1.id()))
        .isEqualTo(1);
    assertThat(features.find(ID, f1.id(), WSJF).orElseThrow().criteria().isEntered("tc")).isFalse();
  }

  @Test
  void anActiveFeatureListIsSortedByExternalIdIgnoringCaseAndSkipsDeletedOnes() {
    features.insert(feature("b-2", Map.of()));
    features.insert(feature("A-1", Map.of("bv", 3)));
    Feature deleted = feature("C-3", Map.of());
    features.insert(deleted);
    assertThat(features.update(deleted.deleted(NOW))).isTrue();

    assertThat(features.listActive(ID, WSJF))
        .extracting(Feature::externalId)
        .containsExactly("A-1", "b-2");
    assertThat(features.countActive(ID)).isEqualTo(2);
    assertThat(features.find(ID, deleted.id(), WSJF)).isEmpty();
  }

  @Test
  void updatingChecksAndIncrementsTheVersion() {
    Feature f1 = feature("F-1", Map.of("bv", 8, "js", 4));
    features.insert(f1);

    Feature changed =
        f1.withTitle("Nouveau titre")
            .withCriteria(Criteria.of(WSJF, Map.of("bv", 9)))
            .markForReview("À revoir");
    assertThat(features.update(changed)).isTrue();

    Feature found = features.find(ID, f1.id(), WSJF).orElseThrow();
    assertThat(found.version()).isEqualTo(1);
    assertThat(found.title()).isEqualTo("Nouveau titre");
    assertThat(found.criteria().asMap()).isEqualTo(Map.of("bv", 9));
    assertThat(found.markedForReview()).isTrue();
    assertThat(found.reviewReason()).isEqualTo("À revoir");
    // Même version lue deux fois : la seconde écriture est périmée et n'écrit rien.
    assertThat(features.update(changed.withTitle("Concurrent"))).isFalse();
    assertThat(features.find(ID, f1.id(), WSJF).orElseThrow().title()).isEqualTo("Nouveau titre");
  }

  @Test
  void anExternalIdIsTakenIgnoringCaseExceptForTheFeatureItself() {
    Feature f1 = feature("F-1", Map.of());
    features.insert(f1);

    assertThat(features.externalIdTaken(ID, "f-1", null)).isTrue();
    assertThat(features.externalIdTaken(ID, "F-1", UUID.randomUUID())).isTrue();
    assertThat(features.externalIdTaken(ID, "F-1", f1.id())).isFalse();
    assertThat(features.externalIdTaken(ID, "F-2", null)).isFalse();
  }

  @Test
  void aDeletedFeatureFreesItsExternalId() {
    Feature f1 = feature("F-1", Map.of());
    features.insert(f1);
    features.update(f1.deleted(NOW));

    assertThat(features.externalIdTaken(ID, "F-1", null)).isFalse();
    features.insert(feature("F-1", Map.of()));
    assertThat(features.countActive(ID)).isEqualTo(1);
  }

  @Test
  void deletingASessionDeletesItsParticipantsAndFeatures() {
    participants.insert(participant("Bob", Role.PARTICIPANT, "t"));
    features.insert(feature("F-1", Map.of("bv", 1)));

    jdbc.update("delete from session where session_id = ?", ID.value());

    assertThat(jdbc.queryForObject("select count(*) from participant", Integer.class)).isZero();
    assertThat(jdbc.queryForObject("select count(*) from feature", Integer.class)).isZero();
    assertThat(jdbc.queryForObject("select count(*) from feature_criterion_value", Integer.class))
        .isZero();
  }

  // --- Transaction ----------------------------------------------------------------------------

  @Test
  void aFailureRollsBackTheFeatureAndItsHistoryTogether() {
    Feature f1 = feature("F-1", Map.of("bv", 8));
    features.insert(f1);

    assertThatThrownBy(
            () ->
                transaction.executeWithoutResult(
                    status -> {
                      features.update(f1.withCriteria(Criteria.of(WSJF, Map.of("bv", 9))));
                      changeLog.valueChanged(ID, Pseudo.of("Alice"), f1.id(), "bv", 8, 9);
                      sessions.incrementVersion(ID);
                      throw new IllegalStateException("panne");
                    }))
        .isInstanceOf(IllegalStateException.class);

    assertThat(features.find(ID, f1.id(), WSJF).orElseThrow().criteria().get("bv")).isEqualTo(8);
    assertThat(jdbc.queryForObject("select count(*) from change_log", Integer.class)).isZero();
    assertThat(sessions.find(ID).orElseThrow().version()).isZero();
  }

  @Test
  void theFeatureAndItsHistoryAreCommittedTogether() {
    Feature f1 = feature("F-1", Map.of("bv", 8));
    features.insert(f1);

    transaction.executeWithoutResult(
        status -> {
          features.update(f1.withCriteria(Criteria.of(WSJF, Map.of("bv", 9))));
          changeLog.valueChanged(ID, Pseudo.of("Alice"), f1.id(), "bv", 8, 9);
        });

    assertThat(features.find(ID, f1.id(), WSJF).orElseThrow().criteria().get("bv")).isEqualTo(9);
    assertThat(jdbc.queryForObject("select count(*) from change_log", Integer.class)).isEqualTo(1);
    List<Map<String, Object>> rows = jdbc.queryForList("select field, action from change_log");
    assertThat(rows.getFirst())
        .containsEntry("field", "bv")
        .containsEntry("action", "VALUE_CHANGE");
  }
}
