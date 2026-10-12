package com.priorisationepic.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.domain.method.Criteria;
import com.priorisationepic.domain.method.InvalidValueException;
import com.priorisationepic.domain.method.UnknownCriterionException;
import com.priorisationepic.domain.method.WsjfMethod;
import com.priorisationepic.domain.scale.Scale;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class FeatureTest {

  private static final SessionId SESSION = new SessionId("d".repeat(22));
  private static final WsjfMethod WSJF = new WsjfMethod();
  private static final Scale SCALE = Scale.defaultScale();
  private static final Instant NOW = Instant.parse("2026-10-12T10:00:00Z");

  private static Feature feature() {
    return Feature.create(
        UUID.randomUUID(),
        SESSION,
        " F-1 ",
        "Titre",
        "Desc",
        Criteria.empty(WSJF.definition()),
        SCALE);
  }

  @Test
  void createsWithDefaults() {
    Feature f = feature();
    assertThat(f.externalId()).isEqualTo("F-1");
    assertThat(f.externalKey()).isEqualTo("f-1");
    assertThat(f.title()).isEqualTo("Titre");
    assertThat(f.description()).isEqualTo("Desc");
    assertThat(f.markedForReview()).isFalse();
    assertThat(f.reviewReason()).isNull();
    assertThat(f.deletedAt()).isNull();
    assertThat(f.isDeleted()).isFalse();
    assertThat(f.version()).isZero();
  }

  @Test
  void nullDescriptionBecomesEmpty() {
    Feature f =
        Feature.create(
            UUID.randomUUID(), SESSION, "A", "T", null, Criteria.empty(WSJF.definition()), SCALE);
    assertThat(f.description()).isEmpty();
  }

  @Test
  void validatesTextLengths() {
    Criteria none = Criteria.empty(WSJF.definition());
    UUID id = UUID.randomUUID();
    assertThat(
            Feature.create(
                id, SESSION, "a".repeat(50), "t".repeat(200), "d".repeat(5000), none, SCALE))
        .isNotNull();
    for (String badId : new String[] {null, "", "  ", "a".repeat(51)}) {
      assertThatThrownBy(() -> Feature.create(id, SESSION, badId, "t", null, none, SCALE))
          .isInstanceOf(InvalidFeatureException.class);
    }
    for (String badTitle : new String[] {null, "", " ", "t".repeat(201)}) {
      assertThatThrownBy(() -> Feature.create(id, SESSION, "a", badTitle, null, none, SCALE))
          .isInstanceOf(InvalidFeatureException.class);
    }
    assertThatThrownBy(() -> Feature.create(id, SESSION, "a", "t", "d".repeat(5001), none, SCALE))
        .isInstanceOf(InvalidFeatureException.class);
  }

  @Test
  void requiresIdSessionAndCriteria() {
    Criteria none = Criteria.empty(WSJF.definition());
    assertThatThrownBy(() -> Feature.create(null, SESSION, "a", "t", null, none, SCALE))
        .isInstanceOf(NullPointerException.class);
    assertThatThrownBy(() -> Feature.create(UUID.randomUUID(), null, "a", "t", null, none, SCALE))
        .isInstanceOf(NullPointerException.class);
    assertThatThrownBy(
            () -> Feature.create(UUID.randomUUID(), SESSION, "a", "t", null, null, SCALE))
        .isInstanceOf(NullPointerException.class);
  }

  @Test
  void createRefusesValuesOutsideTheScale() {
    Criteria c = Criteria.empty(WSJF.definition()).with("bv", 11);
    assertThatThrownBy(() -> Feature.create(UUID.randomUUID(), SESSION, "a", "t", null, c, SCALE))
        .isInstanceOf(InvalidValueException.class);
  }

  @Test
  void withCriteriaChecksTheScale() {
    Feature f = feature();
    Feature updated = f.withCriteria(f.criteria().with("bv", 10), SCALE);
    assertThat(updated.criteria().value("bv")).hasValue(10);
    assertThat(f.criteria().value("bv")).isEmpty();
    Criteria tooBig = f.criteria().with("bv", 11);
    assertThatThrownBy(() -> f.withCriteria(tooBig, SCALE))
        .isInstanceOf(InvalidValueException.class);
    assertThat(f.withCriteria(tooBig, Scale.continuous(20)).criteria().value("bv")).hasValue(11);
  }

  @Test
  void withDetailsAndExternalIdAreValidated() {
    Feature f = feature();
    Feature d = f.withDetails("Autre", null);
    assertThat(d.title()).isEqualTo("Autre");
    assertThat(d.description()).isEmpty();
    assertThat(d.externalId()).isEqualTo("F-1");
    assertThatThrownBy(() -> f.withDetails("", "x")).isInstanceOf(InvalidFeatureException.class);
    assertThat(f.withExternalId("G-2").externalId()).isEqualTo("G-2");
    assertThatThrownBy(() -> f.withExternalId(" ")).isInstanceOf(InvalidFeatureException.class);
  }

  @Test
  void reviewMarkIsSetAndClearedWithoutAffectingTheScore() {
    Feature f =
        feature()
            .withCriteria(
                feature().criteria().with("bv", 1).with("tc", 1).with("rrOe", 1).with("js", 1),
                SCALE);
    Feature marked = f.markForReview("à discuter");
    assertThat(marked.markedForReview()).isTrue();
    assertThat(marked.reviewReason()).isEqualTo("à discuter");
    assertThat(marked.score(WSJF, SCALE)).isEqualTo(f.score(WSJF, SCALE));
    Feature cleared = marked.clearReview();
    assertThat(cleared.markedForReview()).isFalse();
    assertThat(cleared.reviewReason()).isNull();
    assertThat(f.markForReview(null).reviewReason()).isNull();
    assertThat(f.markForReview("  ").reviewReason()).isNull();
    assertThat(f.markForReview("m".repeat(200)).reviewReason()).hasSize(200);
    assertThatThrownBy(() -> f.markForReview("m".repeat(201)))
        .isInstanceOf(InvalidFeatureException.class);
  }

  @Test
  void deleteIsSoft() {
    Feature f = feature();
    Feature gone = f.delete(NOW);
    assertThat(gone.isDeleted()).isTrue();
    assertThat(gone.deletedAt()).isEqualTo(NOW);
    assertThat(gone.externalId()).isEqualTo("F-1");
    assertThat(f.isDeleted()).isFalse();
  }

  @Test
  void versionIsCarried() {
    Feature f = feature();
    assertThat(f.withVersion(7).version()).isEqualTo(7);
    assertThat(f.withVersion(7).id()).isEqualTo(f.id());
  }

  @Test
  void appliesCriteriaChangesAndClearsWithNull() {
    Feature f = feature().withCriteriaChanges(java.util.Map.of("bv", 8, "tc", 5), SCALE);
    assertThat(f.criteria().value("bv").getAsInt()).isEqualTo(8);
    Map<String, Integer> clear = new HashMap<>();
    clear.put("bv", null);
    Feature cleared = f.withCriteriaChanges(clear, SCALE);
    assertThat(cleared.criteria().value("bv")).isEmpty();
    assertThat(cleared.criteria().value("tc").getAsInt()).isEqualTo(5);
  }

  @Test
  void onlyChangedValuesAreCheckedAgainstTheScale() {
    Feature outOfScale =
        feature().withCriteriaChanges(java.util.Map.of("js", 13), Scale.continuous(20));
    Feature f = outOfScale.withCriteriaChanges(java.util.Map.of("bv", 3), SCALE);
    assertThat(f.criteria().value("js").getAsInt()).isEqualTo(13);
    assertThat(f.criteria().value("bv").getAsInt()).isEqualTo(3);
  }

  @Test
  void rejectsUnknownCriterionAndOutOfScaleValue() {
    assertThatThrownBy(() -> feature().withCriteriaChanges(java.util.Map.of("zz", 1), SCALE))
        .isInstanceOf(UnknownCriterionException.class);
    assertThatThrownBy(() -> feature().withCriteriaChanges(java.util.Map.of("bv", 99), SCALE))
        .isInstanceOf(InvalidValueException.class);
  }
}
