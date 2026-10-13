package com.priorisationepic.domain.scale;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
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
}
