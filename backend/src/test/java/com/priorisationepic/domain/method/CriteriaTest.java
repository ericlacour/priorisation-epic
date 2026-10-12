package com.priorisationepic.domain.method;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class CriteriaTest {

  private static final MethodDefinition DEF = new WsjfMethod().definition();

  @Test
  void emptyHasNoValue() {
    Criteria c = Criteria.empty(DEF);
    assertThat(c.values()).isEmpty();
    assertThat(c.value("bv")).isEmpty();
  }

  @Test
  void dropsNullValuesAndKeepsDefinitionOrder() {
    Map<String, Integer> raw = new HashMap<>();
    raw.put("js", 4);
    raw.put("bv", 8);
    raw.put("tc", null);
    Criteria c = new Criteria(DEF, raw);
    assertThat(c.values()).containsExactly(Map.entry("bv", 8), Map.entry("js", 4));
  }

  @Test
  void withSetsAndClearsOneValue() {
    Criteria c = Criteria.empty(DEF).with("bv", 3).with("tc", 5);
    assertThat(c.value("bv")).hasValue(3);
    Criteria cleared = c.with("bv", null);
    assertThat(cleared.value("bv")).isEmpty();
    assertThat(cleared.value("tc")).hasValue(5);
    assertThat(c.value("bv")).hasValue(3);
  }

  @Test
  void refusesUnknownKeys() {
    Criteria c = Criteria.empty(DEF);
    assertThatThrownBy(() -> c.with("x", 1)).isInstanceOf(UnknownCriterionException.class);
    assertThatThrownBy(() -> c.value("x")).isInstanceOf(UnknownCriterionException.class);
    assertThat(new UnknownCriterionException("x").key()).isEqualTo("x");
  }

  @Test
  void refusesValuesBelowOne() {
    Criteria c = Criteria.empty(DEF);
    assertThatThrownBy(() -> c.with("bv", 0)).isInstanceOf(InvalidValueException.class);
    assertThatThrownBy(() -> c.with("bv", -3)).isInstanceOf(InvalidValueException.class);
    assertThat(c.with("bv", 1).value("bv")).hasValue(1);
  }

  @Test
  void isImmutable() {
    Criteria c = Criteria.empty(DEF).with("bv", 1);
    assertThatThrownBy(() -> c.values().put("tc", 2))
        .isInstanceOf(UnsupportedOperationException.class);
  }

  @Test
  void scoreFlagsOutOfScaleCriteriaInDefinitionOrder() {
    Criteria c = Criteria.empty(DEF).with("js", 50).with("bv", 11).with("tc", 5).with("rrOe", 12);
    Score s = Score.of(new WsjfMethod(), c, com.priorisationepic.domain.scale.Scale.defaultScale());
    assertThat(s.outOfScale()).containsExactly("bv", "rrOe", "js");
    assertThat(s.complete()).isFalse();
    assertThat(s.exact()).isEmpty();
  }

  @Test
  void explainRefusesAnIncompleteFeature() {
    Criteria c = Criteria.empty(DEF).with("bv", 1);
    WsjfMethod wsjf = new WsjfMethod();
    assertThatThrownBy(() -> wsjf.explain(c)).isInstanceOf(IllegalArgumentException.class);
  }
}
