package com.priorisationepic.domain.method;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.testmethod.FakeTwoCriteriaMethod;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Le domaine fonctionne pour une méthode qui n'a rien du WSJF (FR-017a, FR-017b, SC-009). */
class MethodGenericityTest {

  private static final FakeTwoCriteriaMethod FAKE = new FakeTwoCriteriaMethod();
  private static final MethodRegistry REGISTRY =
      new MethodRegistry(List.of(new WsjfMethod(), FAKE));

  private record Row(String id, Score score) {}

  private static Row row(String id, Integer reach, Integer effort) {
    java.util.Map<String, Integer> values = new java.util.HashMap<>();
    if (reach != null) values.put("reach", reach);
    if (effort != null) values.put("effort", effort);
    return new Row(
        id, Score.of(FAKE, Criteria.of(FAKE.definition(), values), Scale.defaultScale()));
  }

  @Test
  void theRegistryFindsAMethodByKeyAndVersion() {
    assertThat(REGISTRY.get("WSJF", 1)).isInstanceOf(WsjfMethod.class);
    assertThat(REGISTRY.get("REACH", 1)).isSameAs(FAKE);
    assertThat(REGISTRY.find("REACH", 1)).containsSame(FAKE);
  }

  @Test
  void anUnknownMethodOrVersionIsRefused() {
    assertThatThrownBy(() -> REGISTRY.get("WSJF", 2)).isInstanceOf(UnknownMethodException.class);
    assertThatThrownBy(() -> REGISTRY.get("RICE", 1)).isInstanceOf(UnknownMethodException.class);
    assertThatThrownBy(() -> REGISTRY.latest("RICE")).isInstanceOf(UnknownMethodException.class);
    assertThat(REGISTRY.find("WSJF", 2)).isEmpty();
  }

  @Test
  void theLatestVersionIsOfferedAndOlderOnesStayKnown() {
    PrioritizationMethod v2 =
        new PrioritizationMethod() {
          @Override
          public MethodDefinition definition() {
            MethodDefinition v1 = FAKE.definition();
            return new MethodDefinition(
                v1.key(),
                2,
                v1.name(),
                v1.criteria(),
                v1.computedValues(),
                v1.formula(),
                v1.tieBreakRule());
          }

          @Override
          public Map<String, Fraction> compute(Criteria criteria) {
            return FAKE.compute(criteria);
          }

          @Override
          public String explain(Criteria criteria) {
            return FAKE.explain(criteria);
          }

          @Override
          public int compare(Map<String, Fraction> a, Map<String, Fraction> b) {
            return FAKE.compare(a, b);
          }
        };
    MethodRegistry registry = new MethodRegistry(List.of(new WsjfMethod(), FAKE, v2));

    assertThat(registry.latest("REACH")).isSameAs(v2);
    assertThat(registry.get("REACH", 1)).isSameAs(FAKE);
    assertThat(registry.available()).hasSize(2).contains(v2).doesNotContain(FAKE);
  }

  @Test
  void theDefaultMethodIsWsjf() {
    assertThat(REGISTRY.defaultMethod()).isInstanceOf(WsjfMethod.class);
    assertThat(MethodRegistry.standard().available()).hasSize(1);
    assertThat(MethodRegistry.standard().defaultMethod().definition().version()).isEqualTo(1);
  }

  @Test
  void aDuplicateMethodIsRefused() {
    assertThatThrownBy(() -> new MethodRegistry(List.of(new WsjfMethod(), new WsjfMethod())))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void criteriaAcceptTheKeysOfTheMethodOnly() {
    Criteria ok = Criteria.of(FAKE.definition(), Map.of("reach", 5, "effort", 2));

    assertThat(ok.get("reach")).isEqualTo(5);
    assertThat(ok.keys()).containsExactly("reach", "effort");
    assertThatThrownBy(() -> Criteria.of(FAKE.definition(), Map.of("bv", 3)))
        .isInstanceOf(UnknownCriterionException.class)
        .hasMessageContaining("bv");
    assertThatThrownBy(() -> Criteria.of(new WsjfMethod().definition(), Map.of("reach", 3)))
        .isInstanceOf(UnknownCriterionException.class);
  }

  @Test
  void criteriaRefuseValuesBelowOne() {
    assertThatThrownBy(() -> Criteria.of(FAKE.definition(), Map.of("reach", 0)))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void criteriaMergeChangesAndClearNulls() {
    Criteria before = Criteria.of(FAKE.definition(), Map.of("reach", 5, "effort", 2));
    java.util.Map<String, Integer> changes = new java.util.HashMap<>();
    changes.put("reach", 7);
    changes.put("effort", null);

    Criteria after = before.with(FAKE.definition(), changes);

    assertThat(after.get("reach")).isEqualTo(7);
    assertThat(after.isEntered("effort")).isFalse();
    assertThat(before.get("reach")).isEqualTo(5);
    assertThat(Criteria.empty().keys()).isEmpty();
    assertThat(after).isEqualTo(Criteria.of(FAKE.definition(), Map.of("reach", 7)));
    assertThat(after.hashCode())
        .isEqualTo(Criteria.of(FAKE.definition(), Map.of("reach", 7)).hashCode());
  }

  @Test
  void scoreAndRankingWorkWithoutAnyWsjfCode() {
    Row high = row("R-1", 9, 3);
    Row low = row("R-2", 3, 3);
    Row incomplete = row("R-0", 5, null);

    assertThat(high.score().complete()).isTrue();
    assertThat(high.score().computed()).containsOnlyKeys("ratio");
    assertThat(high.score().computed().get("ratio").display(Display.DECIMAL_2)).isEqualTo("3,00");
    assertThat(high.score().explanation()).isEqualTo("Ratio = 9 / 3");

    List<String> order =
        Ranking.rank(FAKE, List.of(low, incomplete, high), Row::id, Row::score).stream()
            .map(r -> r.item().id())
            .toList();
    assertThat(order).containsExactly("R-1", "R-2", "R-0");
  }

  @Test
  void theWsjfDefinitionMatchesTheDataModelTable() {
    MethodDefinition d = new WsjfMethod().definition();

    assertThat(d.key()).isEqualTo("WSJF");
    assertThat(d.version()).isEqualTo(1);
    assertThat(d.name()).isEqualTo("WSJF");
    assertThat(d.criteria())
        .extracting(
            CriterionDefinition::key,
            CriterionDefinition::code,
            CriterionDefinition::label,
            CriterionDefinition::header)
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple("bv", "BV", "Business Value", "BV"),
            org.assertj.core.groups.Tuple.tuple("tc", "TC", "Time Criticality", "TC"),
            org.assertj.core.groups.Tuple.tuple(
                "rrOe", "RR/OE", "Risk Reduction / Opportunity Enablement", "RR/OE"),
            org.assertj.core.groups.Tuple.tuple("js", "JS", "Job Size", "JS"));
    assertThat(d.criteria())
        .extracting(CriterionDefinition::definition)
        .allSatisfy(t -> assertThat(t).isNotBlank().endsWith("."));
    assertThat(d.computedValues())
        .extracting(
            ComputedValueDefinition::key,
            ComputedValueDefinition::code,
            ComputedValueDefinition::label,
            ComputedValueDefinition::header,
            ComputedValueDefinition::display)
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple(
                "cod", "CoD", "Cost of Delay", "CoD", Display.INTEGER),
            org.assertj.core.groups.Tuple.tuple(
                "wsjf", "WSJF", "Weighted Shortest Job First", "WSJF", Display.DECIMAL_2));
    assertThat(d.formula()).isEqualTo("CoD = BV + TC + RR/OE ; WSJF = CoD / JS");
    assertThat(d.tieBreakRule()).startsWith("WSJF décroissant, puis CoD décroissant");
    assertThat(d.hasCriterion("bv")).isTrue();
    assertThat(d.hasCriterion("cod")).isFalse();
    assertThat(d.computedValue("wsjf")).isPresent();
    assertThat(d.computedValue("bv")).isEmpty();
  }

  @Test
  void aDefinitionRefusesDuplicateKeysAndAnEmptyCriteriaList() {
    MethodDefinition d = FAKE.definition();

    assertThatThrownBy(
            () ->
                new MethodDefinition(
                        "X",
                        1,
                        "X",
                        d.criteria(),
                        d.criteria().isEmpty() ? List.of() : List.of(),
                        "f",
                        "t")
                    .criteria()
                    .clear())
        .isInstanceOf(UnsupportedOperationException.class);
    assertThatThrownBy(() -> new MethodDefinition("X", 1, "X", List.of(), List.of(), "f", "t"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new MethodDefinition("X", 0, "X", d.criteria(), List.of(), "f", "t"))
        .isInstanceOf(IllegalArgumentException.class);
    CriterionDefinition first = d.criteria().get(0);
    assertThatThrownBy(
            () -> new MethodDefinition("X", 1, "X", List.of(first, first), List.of(), "f", "t"))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void aCompleteScoreNeedsItsExplanationAndAnIncompleteOneHasNone() {
    assertThatThrownBy(() -> new Score(false, List.of(), Map.of(), null, null))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new Score(true, List.of(), null, "x", null))
        .isInstanceOf(NullPointerException.class);
    assertThat(row("R-1", 4, 2).score().withRank(3).rank()).isEqualTo(3);
  }
}
