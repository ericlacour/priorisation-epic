package com.priorisationepic.domain.scale;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import net.jqwik.api.Arbitraries;
import net.jqwik.api.Arbitrary;
import net.jqwik.api.ForAll;
import net.jqwik.api.Property;
import net.jqwik.api.Provide;

/** Propriétés de {@link Scale#accepts} et {@link Scale#allowedValues} (FR-009, FR-010). */
class ScalePropertiesTest {

  @Provide
  Arbitrary<Scale> scales() {
    Arbitrary<Scale> continuous =
        Arbitraries.integers()
            .between(Scale.MIN_MAX, Scale.MAX_MAX)
            .map(max -> new Scale(ScaleType.CONTINUOUS, max));
    Arbitrary<Scale> fibonacci =
        Arbitraries.of(Scale.FIBONACCI_BOUNDS).map(max -> new Scale(ScaleType.FIBONACCI, max));
    return Arbitraries.oneOf(continuous, fibonacci);
  }

  @Property
  void acceptsExactlyTheAllowedValues(@ForAll("scales") Scale scale, @ForAll int value) {
    assertThat(scale.accepts(value)).isEqualTo(scale.allowedValues().contains(value));
  }

  @Property
  void acceptsExactlyTheAllowedValuesAroundTheBound(
      @ForAll("scales") Scale scale, @ForAll("smallValues") int value) {
    assertThat(scale.accepts(value)).isEqualTo(scale.allowedValues().contains(value));
  }

  @Provide
  Arbitrary<Integer> smallValues() {
    return Arbitraries.integers().between(-2, 110);
  }

  @Property
  void theAllowedValuesStartAt1AndEndAtTheBoundInIncreasingOrder(@ForAll("scales") Scale scale) {
    List<Integer> values = scale.allowedValues();

    assertThat(values.getFirst()).isEqualTo(1);
    assertThat(values.getLast()).isEqualTo(scale.max());
    assertThat(values).isSorted().doesNotHaveDuplicates();
  }

  @Property
  void aFibonacciScaleOnlyAllowsSafeValues(@ForAll("scales") Scale scale) {
    if (scale.type() == ScaleType.FIBONACCI) {
      assertThat(List.of(1, 2, 3, 5, 8, 13, 20, 40, 100)).containsAll(scale.allowedValues());
    }
  }
}
