package com.priorisationepic.domain.scale;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class ScaleTest {

  @Test
  void defaultScaleIsContinuousOneToTen() {
    Scale scale = Scale.defaultScale();
    assertThat(scale.type()).isEqualTo(ScaleType.CONTINUOUS);
    assertThat(scale.max()).isEqualTo(10);
  }

  @Test
  void maxIsBetween2And100() {
    assertThat(Scale.continuous(2).max()).isEqualTo(2);
    assertThat(Scale.continuous(100).max()).isEqualTo(100);
    assertThatThrownBy(() -> Scale.continuous(1)).isInstanceOf(InvalidScaleException.class);
    assertThatThrownBy(() -> Scale.continuous(101)).isInstanceOf(InvalidScaleException.class);
    assertThatThrownBy(() -> Scale.continuous(0)).isInstanceOf(InvalidScaleException.class);
    assertThatThrownBy(() -> Scale.continuous(-5)).isInstanceOf(InvalidScaleException.class);
  }

  @Test
  void typeIsRequired() {
    assertThatThrownBy(() -> new Scale(null, 10)).isInstanceOf(InvalidScaleException.class);
  }

  @Test
  void acceptsIntegersFromOneToMax() {
    Scale scale = Scale.continuous(10);
    assertThat(scale.accepts(1)).isTrue();
    assertThat(scale.accepts(10)).isTrue();
    assertThat(scale.accepts(0)).isFalse();
    assertThat(scale.accepts(11)).isFalse();
    assertThat(scale.accepts(-1)).isFalse();
  }

  @Test
  void refusesNonIntegerValues() {
    Scale scale = Scale.continuous(10);
    assertThat(scale.accepts(new BigDecimal("2.5"))).isFalse();
    assertThat(scale.accepts(new BigDecimal("0.5"))).isFalse();
    assertThat(scale.accepts(new BigDecimal("3"))).isTrue();
    assertThat(scale.accepts(new BigDecimal("3.0"))).isTrue();
    assertThat(scale.accepts(new BigDecimal("11"))).isFalse();
    assertThat(scale.accepts(new BigDecimal("0"))).isFalse();
    assertThat(scale.accepts(new BigDecimal("99999999999999999999"))).isFalse();
    assertThat(scale.accepts((BigDecimal) null)).isFalse();
  }

  @Test
  void allowedValuesListOneToMax() {
    assertThat(Scale.continuous(10).allowedValues()).containsExactly(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);
    assertThat(Scale.continuous(2).allowedValues()).isEqualTo(List.of(1, 2));
    assertThat(Scale.continuous(100).allowedValues()).hasSize(100).endsWith(100);
  }
}
