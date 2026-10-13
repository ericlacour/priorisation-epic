package com.priorisationepic.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.domain.method.Criteria;
import com.priorisationepic.domain.method.MethodDefinition;
import com.priorisationepic.domain.method.WsjfMethod;
import com.priorisationepic.domain.scale.Scale;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AggregatesTest {

  private static final SessionId SESSION = new SessionId("k3Jx9QvT2mLpZ8wR4nYb7A");
  private static final Instant NOW = Instant.parse("2026-10-12T08:00:00Z");
  private static final WsjfMethod WSJF = new WsjfMethod();
  private static final MethodDefinition DEFINITION = WSJF.definition();

  // --- Session --------------------------------------------------------------------------------

  @Test
  void aNewSessionStartsInPreparationWithTheMethodVersionItWasGiven() {
    Session session =
        Session.create(SESSION, "Atelier", WSJF, Scale.defaultScale(), Pseudo.of("Éric"), NOW);

    assertThat(session.status()).isEqualTo(SessionStatus.PREPARATION);
    assertThat(session.method()).isEqualTo("WSJF");
    assertThat(session.methodVersion()).isEqualTo(1);
    assertThat(session.scale()).isEqualTo(Scale.defaultScale());
    assertThat(session.version()).isZero();
    assertThat(session.isWritable()).isTrue();
  }

  @Test
  void aClosedSessionIsNotWritable() {
    Session closed =
        new Session(
            SESSION,
            "A",
            SessionStatus.CLOSED,
            "WSJF",
            1,
            Scale.defaultScale(),
            NOW,
            Pseudo.of("É"),
            3);

    assertThat(closed.isWritable()).isFalse();
    assertThat(
            new Session(
                    SESSION,
                    "A",
                    SessionStatus.IN_PROGRESS,
                    "WSJF",
                    1,
                    Scale.defaultScale(),
                    NOW,
                    Pseudo.of("É"),
                    0)
                .isWritable())
        .isTrue();
  }

  @Test
  void aSessionNameHasFrom1To120Characters() {
    assertThat(
            Session.create(
                    SESSION, "x".repeat(120), WSJF, Scale.defaultScale(), Pseudo.of("É"), NOW)
                .name())
        .hasSize(120);
    for (String bad : new String[] {null, "", "   ", "x".repeat(121)}) {
      assertThatThrownBy(
              () -> Session.create(SESSION, bad, WSJF, Scale.defaultScale(), Pseudo.of("É"), NOW))
          .isInstanceOf(IllegalArgumentException.class);
    }
  }

  // --- Participant ----------------------------------------------------------------------------

  @Test
  void theCreatorIsTheFacilitatorAndAnArrivalIsAPlainParticipant() {
    Participant facilitator =
        Participant.facilitator(UUID.randomUUID(), SESSION, Pseudo.of("Alice"), "h", NOW);
    Participant bob =
        Participant.joining(UUID.randomUUID(), SESSION, Pseudo.of("Bob"), "Architecte", "h", NOW);

    assertThat(facilitator.isFacilitator()).isTrue();
    assertThat(facilitator.businessRole()).isNull();
    assertThat(bob.isFacilitator()).isFalse();
    assertThat(bob.role()).isEqualTo(Role.PARTICIPANT);
    assertThat(bob.joinedAt()).isEqualTo(NOW);
    assertThat(bob.lastSeenAt()).isEqualTo(NOW);
  }

  @Test
  void aPseudoIsReclaimableAfterTheAbsenceTimeoutButNeverTheFacilitators() {
    Duration timeout = Duration.ofMinutes(10);
    Participant bob =
        Participant.joining(UUID.randomUUID(), SESSION, Pseudo.of("Bob"), null, "h", NOW);
    Participant alice =
        Participant.facilitator(UUID.randomUUID(), SESSION, Pseudo.of("Alice"), "h", NOW);

    assertThat(bob.isReclaimable(NOW.plus(timeout).minusSeconds(1), timeout)).isFalse();
    assertThat(bob.isReclaimable(NOW.plus(timeout), timeout)).isTrue();
    assertThat(bob.isReclaimable(NOW.plus(timeout).plusSeconds(1), timeout)).isTrue();
    assertThat(alice.isReclaimable(NOW.plus(Duration.ofDays(30)), timeout)).isFalse();
  }

  @Test
  void aTakeOverReplacesTheTokenAndKeepsTheIdentity() {
    Participant bob =
        Participant.joining(UUID.randomUUID(), SESSION, Pseudo.of("Bob"), "Tech Lead", "old", NOW);

    Participant back = bob.withTokenHash("new", NOW.plusSeconds(900));

    assertThat(back.id()).isEqualTo(bob.id());
    assertThat(back.tokenHash()).isEqualTo("new");
    assertThat(back.businessRole()).isEqualTo("Tech Lead");
    assertThat(back.joinedAt()).isEqualTo(NOW);
    assertThat(back.lastSeenAt()).isEqualTo(NOW.plusSeconds(900));
  }

  @Test
  void aBusinessRoleHasAtMost40Characters() {
    Participant.joining(UUID.randomUUID(), SESSION, Pseudo.of("Bob"), "x".repeat(40), "h", NOW);
    assertThatThrownBy(
            () ->
                Participant.joining(
                    UUID.randomUUID(), SESSION, Pseudo.of("Bob"), "x".repeat(41), "h", NOW))
        .isInstanceOf(IllegalArgumentException.class);
  }

  // --- Feature --------------------------------------------------------------------------------

  private static Feature feature() {
    return Feature.create(
        UUID.randomUUID(),
        SESSION,
        "F-1",
        "Paiement",
        null,
        Criteria.of(DEFINITION, Map.of("bv", 8)));
  }

  @Test
  void aNewFeatureIsActiveUnmarkedAndAtVersionZero() {
    Feature feature = feature();

    assertThat(feature.isDeleted()).isFalse();
    assertThat(feature.markedForReview()).isFalse();
    assertThat(feature.reviewReason()).isNull();
    assertThat(feature.version()).isZero();
    assertThat(feature.criteria().get("bv")).isEqualTo(8);
  }

  @Test
  void fieldsAreReplacedOneAtATimeWithoutTouchingTheOthers() {
    Feature feature = feature();

    assertThat(feature.withTitle("Autre").title()).isEqualTo("Autre");
    assertThat(feature.withTitle("Autre").externalId()).isEqualTo("F-1");
    assertThat(feature.withExternalId("F-2").externalId()).isEqualTo("F-2");
    assertThat(feature.withDescription("Texte").description()).isEqualTo("Texte");
    assertThat(feature.withCriteria(Criteria.empty()).criteria().keys()).isEmpty();
    assertThat(feature.withDescription("Texte").title()).isEqualTo("Paiement");
  }

  @Test
  void theReviewMarkCarriesAReasonAndRemovingItClearsTheReason() {
    Feature marked = feature().markForReview("À confirmer");

    assertThat(marked.markedForReview()).isTrue();
    assertThat(marked.reviewReason()).isEqualTo("À confirmer");
    assertThat(marked.unmark().markedForReview()).isFalse();
    assertThat(marked.unmark().reviewReason()).isNull();
    assertThat(feature().markForReview(null).reviewReason()).isNull();
  }

  @Test
  void aReasonWithoutAMarkIsRefused() {
    Feature feature = feature();

    assertThatThrownBy(
            () ->
                new Feature(
                    feature.id(),
                    SESSION,
                    "F-1",
                    "T",
                    null,
                    Criteria.empty(),
                    false,
                    "motif",
                    null,
                    0))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void deletionIsSoft() {
    Feature deleted = feature().deleted(NOW);

    assertThat(deleted.isDeleted()).isTrue();
    assertThat(deleted.deletedAt()).isEqualTo(NOW);
    assertThat(deleted.title()).isEqualTo("Paiement");
  }

  @Test
  void textLimitsAreEnforced() {
    UUID id = UUID.randomUUID();
    Criteria none = Criteria.empty();

    Feature.create(id, SESSION, "x".repeat(50), "x".repeat(200), "x".repeat(5000), none);
    for (String[] bad :
        new String[][] {
          {null, "T", null},
          {"", "T", null},
          {"  ", "T", null},
          {"x".repeat(51), "T", null},
          {"F", null, null},
          {"F", "", null},
          {"F", "   ", null},
          {"F", "x".repeat(201), null},
          {"F", "T", "x".repeat(5001)}
        }) {
      assertThatThrownBy(() -> Feature.create(id, SESSION, bad[0], bad[1], bad[2], none))
          .as(String.join("|", java.util.Arrays.stream(bad).map(String::valueOf).toList()))
          .isInstanceOf(IllegalArgumentException.class);
    }
    assertThat(Feature.create(id, SESSION, "F", "T", null, none).description()).isNull();
    assertThatThrownBy(() -> feature().markForReview("x".repeat(201)))
        .isInstanceOf(IllegalArgumentException.class);
    assertThat(feature().markForReview("x".repeat(200)).reviewReason()).hasSize(200);
  }

  @Test
  void textLengthsAreCountedInCodePoints() {
    String emojis = "😀".repeat(200);

    assertThat(
            Feature.create(UUID.randomUUID(), SESSION, "F", emojis, null, Criteria.empty()).title())
        .isEqualTo(emojis);
  }
}
