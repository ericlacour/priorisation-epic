package com.priorisationepic.domain.scale;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.method.Criteria;
import com.priorisationepic.domain.method.WsjfMethod;
import com.priorisationepic.domain.scale.Scale.Impact;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ScaleTest {

  @Test
  void theDefaultScaleGoesFrom1To10() {
    Scale scale = Scale.defaultScale();

    assertThat(scale.type()).isEqualTo(ScaleType.CONTINUOUS);
    assertThat(scale.max()).isEqualTo(10);
    assertThat(scale.allowedValues()).isEqualTo(List.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10));
  }

  @Test
  void acceptsIntegersFrom1ToMaxIncluded() {
    Scale scale = new Scale(ScaleType.CONTINUOUS, 10);

    assertThat(scale.accepts(1)).isTrue();
    assertThat(scale.accepts(10)).isTrue();
    assertThat(scale.accepts(0)).isFalse();
    assertThat(scale.accepts(11)).isFalse();
    assertThat(scale.accepts(-3)).isFalse();
  }

  @Test
  void aBoxedValueIsRefusedWhenAbsent() {
    Scale scale = Scale.defaultScale();

    assertThat(scale.accepts((Integer) null)).isFalse();
    assertThat(scale.accepts(Integer.valueOf(5))).isTrue();
    assertThat(scale.accepts(Integer.valueOf(11))).isFalse();
  }

  @Test
  void theMaximumIsBetween2And100() {
    assertThat(new Scale(ScaleType.CONTINUOUS, 2).allowedValues()).containsExactly(1, 2);
    assertThat(new Scale(ScaleType.CONTINUOUS, 100).allowedValues()).hasSize(100);
    assertThatThrownBy(() -> new Scale(ScaleType.CONTINUOUS, 1))
        .isInstanceOf(InvalidValueException.class);
    assertThatThrownBy(() -> new Scale(ScaleType.CONTINUOUS, 101))
        .isInstanceOf(InvalidValueException.class);
    assertThatThrownBy(() -> new Scale(null, 10)).isInstanceOf(NullPointerException.class);
  }

  @Test
  void requireAcceptedRefusesAValueOutsideTheScale() {
    Scale scale = Scale.defaultScale();

    scale.requireAccepted(1);
    scale.requireAccepted(10);
    assertThatThrownBy(() -> scale.requireAccepted(0)).isInstanceOf(InvalidValueException.class);
    assertThatThrownBy(() -> scale.requireAccepted(11)).isInstanceOf(InvalidValueException.class);
  }

  // --- Fibonacci (FR-010) ---------------------------------------------------------------------

  @Test
  void fibonacciKeepsTheSafeValuesUpToTheBound() {
    assertThat(new Scale(ScaleType.FIBONACCI, 100).allowedValues())
        .containsExactly(1, 2, 3, 5, 8, 13, 20, 40, 100);
    assertThat(new Scale(ScaleType.FIBONACCI, 13).allowedValues())
        .containsExactly(1, 2, 3, 5, 8, 13);
    assertThat(new Scale(ScaleType.FIBONACCI, 2).allowedValues()).containsExactly(1, 2);
  }

  @Test
  void fibonacciDefaultsTo20() {
    Scale scale = Scale.defaultFor(ScaleType.FIBONACCI);

    assertThat(scale.max()).isEqualTo(20);
    assertThat(scale.allowedValues()).containsExactly(1, 2, 3, 5, 8, 13, 20);
    assertThat(Scale.defaultFor(ScaleType.CONTINUOUS)).isEqualTo(Scale.defaultScale());
  }

  @Test
  void theFibonacciBoundBelongsToTheSequence() {
    for (int bound : new int[] {2, 3, 5, 8, 13, 20, 40, 100}) {
      assertThat(new Scale(ScaleType.FIBONACCI, bound).max()).isEqualTo(bound);
    }
    for (int bound : new int[] {1, 4, 10, 21, 50, 101}) {
      assertThatThrownBy(() -> new Scale(ScaleType.FIBONACCI, bound))
          .isInstanceOf(InvalidValueException.class)
          .hasMessageContaining("2, 3, 5, 8, 13, 20, 40, 100");
    }
  }

  @Test
  void fibonacciWithTheBound13Refuses4And10() {
    Scale scale = new Scale(ScaleType.FIBONACCI, 13);

    assertThat(scale.accepts(13)).isTrue();
    assertThat(scale.accepts(8)).isTrue();
    assertThat(scale.accepts(4)).isFalse();
    assertThat(scale.accepts(10)).isFalse();
    assertThat(scale.accepts(20)).isFalse();
    assertThatThrownBy(() -> scale.requireAccepted(4))
        .isInstanceOf(InvalidValueException.class)
        .hasMessageContaining("1, 2, 3, 5, 8, 13");
  }

  // --- Impact d'un changement d'échelle (FR-011) -------------------------------------------------

  private static final SessionId SESSION = new SessionId("k3Jx9QvT2mLpZ8wR4nYb7A");

  private static Feature feature(String externalId, Map<String, Integer> values) {
    return Feature.create(
        UUID.randomUUID(),
        SESSION,
        externalId,
        "Titre " + externalId,
        null,
        Criteria.of(WsjfMethod.version1().definition(), values));
  }

  @Test
  void theImpactListsTheValuesThatLeaveTheScaleInFeatureAndCriterionOrder() {
    List<Feature> features =
        List.of(
            feature("F-1", Map.of("bv", 4, "tc", 5, "rrOe", 3, "js", 10)),
            feature("F-2", Map.of("bv", 8, "tc", 13)),
            feature("F-3", Map.of()));

    List<Impact> impact =
        Scale.defaultScale().impactOf(new Scale(ScaleType.FIBONACCI, 13), features);

    assertThat(impact).containsExactly(new Impact("F-1", "bv", 4), new Impact("F-1", "js", 10));
  }

  @Test
  void aValueAlreadyOutOfScaleIsNotANewImpact() {
    Scale small = new Scale(ScaleType.CONTINUOUS, 5);
    List<Feature> features = List.of(feature("F-1", Map.of("bv", 8, "tc", 4)));

    assertThat(small.impactOf(new Scale(ScaleType.CONTINUOUS, 3), features))
        .containsExactly(new Impact("F-1", "tc", 4));
  }

  @Test
  void wideningTheScaleHasNoImpact() {
    List<Feature> features = List.of(feature("F-1", Map.of("bv", 10, "js", 1)));

    assertThat(Scale.defaultScale().impactOf(new Scale(ScaleType.CONTINUOUS, 20), features))
        .isEmpty();
  }
}
