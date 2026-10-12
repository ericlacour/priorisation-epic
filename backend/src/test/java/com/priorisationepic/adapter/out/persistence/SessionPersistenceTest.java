package com.priorisationepic.adapter.out.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.PostgresTestBase;
import com.priorisationepic.application.FeatureRepository;
import com.priorisationepic.application.ParticipantRepository;
import com.priorisationepic.application.SessionRepository;
import com.priorisationepic.application.StaleWriteException;
import com.priorisationepic.application.Transactions;
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

/** Persistance des sessions, participants et fonctionnalités, contre PostgreSQL. */
@SpringBootTest
class SessionPersistenceTest extends PostgresTestBase {

  private static final SessionId ID = new SessionId("k3Jx9QvT2mLpZ8wR4nYb7A");
  private static final Instant T0 = Instant.parse("2026-10-12T08:00:00Z");
  private static final MethodDefinition WSJF =
      MethodRegistry.standard().defaultMethod().definition();

  @Autowired JdbcTemplate jdbc;
  @Autowired SessionRepository sessions;
  @Autowired ParticipantRepository participants;
  @Autowired FeatureRepository features;
  @Autowired Transactions transactions;

  @BeforeEach
  void reset() {
    jdbc.update("delete from session");
    sessions.insert(
        Session.create(
            MethodRegistry.standard(),
            ID,
            "Atelier PI 27",
            null,
            Tokens.hash("animation"),
            Pseudo.of("eric"),
            T0));
  }

  private Criteria criteria(Map<String, Integer> values) {
    return new Criteria(WSJF, values);
  }

  private Feature feature(String externalId, String title, Map<String, Integer> values) {
    return Feature.create(
        UUID.randomUUID(),
        ID,
        externalId,
        title,
        "Descriptif",
        criteria(values),
        Scale.defaultScale());
  }

  @Test
  void aSessionIsStoredAndReadBackWithItsFrozenMethodAndScale() {
    Session read = sessions.find(ID).orElseThrow();
    assertThat(read.name()).isEqualTo("Atelier PI 27");
    assertThat(read.method()).isEqualTo("WSJF");
    assertThat(read.methodVersion()).isEqualTo(1);
    assertThat(read.scale()).isEqualTo(Scale.defaultScale());
    assertThat(read.status().name()).isEqualTo("PREPARATION");
    assertThat(read.createdAt()).isEqualTo(T0);
    assertThat(read.createdByPseudo()).isEqualTo(Pseudo.of("eric"));
    assertThat(read.version()).isZero();
    // seule l'empreinte du jeton est gardée
    assertThat(read.animationTokenHash()).isEqualTo(Tokens.hash("animation"));
    assertThat(sessions.animationTokenMatches(ID, "animation")).isTrue();
    assertThat(sessions.find(new SessionId("A".repeat(22)))).isEmpty();
  }

  @Test
  void theSessionVersionGoesUpByOneAtEachBump() {
    assertThat(sessions.bumpVersion(ID)).isEqualTo(1);
    assertThat(sessions.bumpVersion(ID)).isEqualTo(2);
    assertThat(sessions.find(ID).orElseThrow().version()).isEqualTo(2);
  }

  @Test
  void participantsAreStoredByPseudoWithoutCaseAndListedOldestFirst() {
    UUID eric = UUID.randomUUID();
    UUID alice = UUID.randomUUID();
    participants.insert(Participant.join(eric, ID, Pseudo.of("Eric"), Role.FACILITATOR, "h1", T0));
    participants.insert(
        Participant.join(alice, ID, Pseudo.of("Alice"), Role.PARTICIPANT, "h2", T0.plusSeconds(5))
            .withBusinessRole("Tech Lead"));

    assertThat(participants.findByPseudo(ID, Pseudo.of("ERIC")).orElseThrow().id()).isEqualTo(eric);
    assertThat(participants.findByPseudo(ID, Pseudo.of("bob"))).isEmpty();
    assertThat(participants.findAll(ID)).extracting(Participant::id).containsExactly(eric, alice);
    Participant read = participants.find(alice).orElseThrow();
    assertThat(read.role()).isEqualTo(Role.PARTICIPANT);
    assertThat(read.businessRole()).isEqualTo("Tech Lead");
    assertThat(read.joinedAt()).isEqualTo(T0.plusSeconds(5));
  }

  @Test
  void twoParticipantsCannotShareAPseudoInOneSession() {
    participants.insert(
        Participant.join(UUID.randomUUID(), ID, Pseudo.of("Eric"), Role.PARTICIPANT, "h1", T0));
    assertThatThrownBy(
            () ->
                participants.insert(
                    Participant.join(
                        UUID.randomUUID(), ID, Pseudo.of("eRiC"), Role.PARTICIPANT, "h2", T0)))
        .isInstanceOf(org.springframework.dao.DuplicateKeyException.class);
  }

  @Test
  void reclaimingAPseudoReplacesTheTokenHashAndKeepsTheParticipant() {
    UUID id = UUID.randomUUID();
    Participant alice =
        Participant.join(id, ID, Pseudo.of("Alice"), Role.PARTICIPANT, Tokens.hash("old"), T0);
    participants.insert(alice);
    participants.updateToken(alice.reclaim(Tokens.hash("new"), T0.plusSeconds(700)));

    assertThat(participants.findByToken(ID, "old")).isEmpty();
    assertThat(participants.findByToken(ID, "new").orElseThrow().id()).isEqualTo(id);
    assertThat(participants.find(id).orElseThrow().lastSeenAt()).isEqualTo(T0.plusSeconds(700));
  }

  @Test
  void aFeatureIsStoredWithItsValuesByCriterionKey() {
    Feature created = feature("F-1", "Paiement", Map.of("bv", 8, "tc", 5, "rrOe", 3, "js", 4));
    features.insert(created);

    Feature read = features.findActive(ID, created.id(), WSJF).orElseThrow();
    assertThat(read.externalId()).isEqualTo("F-1");
    assertThat(read.title()).isEqualTo("Paiement");
    assertThat(read.description()).isEqualTo("Descriptif");
    assertThat(read.criteria().values()).containsEntry("bv", 8).containsEntry("js", 4).hasSize(4);
    assertThat(read.version()).isZero();
    assertThat(features.countActive(ID)).isEqualTo(1);
    // aucune colonne ne nomme un critère : une ligne par valeur saisie
    assertThat(jdbc.queryForObject("select count(*) from feature_criterion_value", Integer.class))
        .isEqualTo(4);
  }

  @Test
  void aCriterionThatIsNotEnteredHasNoRow() {
    Feature created = feature("F-1", "Partielle", Map.of("bv", 6));
    features.insert(created);
    assertThat(jdbc.queryForObject("select count(*) from feature_criterion_value", Integer.class))
        .isEqualTo(1);
    assertThat(features.findActive(ID, created.id(), WSJF).orElseThrow().criteria().values())
        .containsExactly(Map.entry("bv", 6));
  }

  @Test
  void anEmptyDescriptionIsStoredAsNull() {
    Feature created =
        Feature.create(
            UUID.randomUUID(), ID, "F-1", "T", "", criteria(Map.of()), Scale.defaultScale());
    features.insert(created);
    assertThat(jdbc.queryForObject("select description from feature", String.class)).isNull();
    assertThat(features.findActive(ID, created.id(), WSJF).orElseThrow().description()).isEmpty();
  }

  @Test
  void findActiveListsTheFeaturesOfOneSessionOnlyAndOrdersThemByIdentifier() {
    features.insert(feature("F-2", "Deux", Map.of("bv", 2)));
    features.insert(feature("f-10", "Dix", Map.of()));
    features.insert(feature("F-1", "Un", Map.of("bv", 1, "js", 3)));

    List<Feature> read = features.findActive(ID, WSJF);
    assertThat(read).extracting(Feature::externalId).containsExactly("F-1", "f-10", "F-2");
    assertThat(read.get(0).criteria().values()).containsEntry("bv", 1).containsEntry("js", 3);
    assertThat(read.get(1).criteria().values()).isEmpty();
  }

  @Test
  void updatingAFeatureReplacesItsValuesAndRaisesItsVersion() {
    Feature created = feature("F-1", "Avant", Map.of("bv", 8, "tc", 5));
    features.insert(created);

    features.update(
        created
            .withDetails("Après", "Nouveau descriptif")
            .withCriteria(criteria(Map.of("bv", 9, "js", 2)), Scale.defaultScale())
            .markForReview("à préciser"));

    Feature read = features.findActive(ID, created.id(), WSJF).orElseThrow();
    assertThat(read.title()).isEqualTo("Après");
    assertThat(read.criteria().values())
        .containsEntry("bv", 9)
        .containsEntry("js", 2)
        .doesNotContainKey("tc");
    assertThat(read.markedForReview()).isTrue();
    assertThat(read.reviewReason()).isEqualTo("à préciser");
    assertThat(read.version()).isEqualTo(1);
  }

  @Test
  void aWriteWithAnOldVersionIsRefusedAndChangesNothing() {
    Feature created = feature("F-1", "Titre", Map.of("bv", 8));
    features.insert(created);
    features.update(created.withDetails("Première modification", ""));

    assertThatThrownBy(() -> features.update(created.withDetails("Écrase la précédente", "")))
        .isInstanceOf(StaleWriteException.class);
    assertThat(features.findActive(ID, created.id(), WSJF).orElseThrow().title())
        .isEqualTo("Première modification");
    assertThatThrownBy(() -> features.softDelete(created.id(), T0, 0))
        .isInstanceOf(StaleWriteException.class);
  }

  @Test
  void aSoftDeletedFeatureDisappearsButStaysInTheDatabase() {
    Feature created = feature("F-1", "À supprimer", Map.of("bv", 8));
    features.insert(created);
    features.softDelete(created.id(), T0, 0);

    assertThat(features.findActive(ID, created.id(), WSJF)).isEmpty();
    assertThat(features.findActive(ID, WSJF)).isEmpty();
    assertThat(features.countActive(ID)).isZero();
    assertThat(jdbc.queryForObject("select count(*) from feature", Integer.class)).isEqualTo(1);
    // elle ne peut plus être modifiée ni supprimée
    assertThatThrownBy(() -> features.softDelete(created.id(), T0, 1))
        .isInstanceOf(StaleWriteException.class);
  }

  @Test
  void anIdentifierIsUniqueWithoutCaseAmongActiveFeaturesAndFreedByDeletion() {
    Feature first = feature("F-1", "Une", Map.of());
    features.insert(first);

    assertThat(features.externalKeyTaken(ID, "f-1", null)).isTrue();
    assertThat(features.externalKeyTaken(ID, "f-1", first.id())).isFalse();
    assertThat(features.externalKeyTaken(ID, "f-2", null)).isFalse();
    assertThatThrownBy(() -> features.insert(feature("f-1", "Doublon", Map.of())))
        .isInstanceOf(org.springframework.dao.DuplicateKeyException.class);

    features.softDelete(first.id(), T0, 0);
    assertThat(features.externalKeyTaken(ID, "f-1", null)).isFalse();
    features.insert(feature("F-1", "Réutilise l'identifiant", Map.of()));
    assertThat(features.countActive(ID)).isEqualTo(1);
  }

  @Test
  void aFeatureOfAnotherSessionIsNotVisible() {
    SessionId other = new SessionId("B".repeat(22));
    sessions.insert(
        Session.create(
            MethodRegistry.standard(), other, "Autre", null, Tokens.hash("x"), Pseudo.of("z"), T0));
    Feature created = feature("F-1", "Ici", Map.of());
    features.insert(created);

    assertThat(features.findActive(other, created.id(), WSJF)).isEmpty();
    assertThat(features.findActive(other, WSJF)).isEmpty();
    assertThat(features.countActive(other)).isZero();
  }

  @Test
  void aTransactionIsRolledBackAsAWholeWhenItFails() {
    Feature created = feature("F-1", "Annulée", Map.of("bv", 1));
    assertThatThrownBy(
            () ->
                transactions.inTransaction(
                    () -> {
                      features.insert(created);
                      sessions.bumpVersion(ID);
                      throw new IllegalStateException("échec au milieu");
                    }))
        .isInstanceOf(IllegalStateException.class);

    assertThat(features.countActive(ID)).isZero();
    assertThat(sessions.find(ID).orElseThrow().version()).isZero();
  }

  @Test
  void aTransactionKeepsEverythingWhenItSucceeds() {
    Feature created = feature("F-1", "Gardée", Map.of("bv", 1));
    long version =
        transactions.inTransaction(
            () -> {
              features.insert(created);
              return sessions.bumpVersion(ID);
            });
    assertThat(version).isEqualTo(1);
    assertThat(features.countActive(ID)).isEqualTo(1);
  }

  @Test
  void deletingASessionDeletesItsParticipantsAndFeatures() {
    participants.insert(
        Participant.join(UUID.randomUUID(), ID, Pseudo.of("Eric"), Role.FACILITATOR, "h", T0));
    features.insert(feature("F-1", "Une", Map.of("bv", 1)));
    jdbc.update("delete from session where session_id = ?", ID.value());
    assertThat(jdbc.queryForObject("select count(*) from participant", Integer.class)).isZero();
    assertThat(jdbc.queryForObject("select count(*) from feature", Integer.class)).isZero();
    assertThat(jdbc.queryForObject("select count(*) from feature_criterion_value", Integer.class))
        .isZero();
  }
}
