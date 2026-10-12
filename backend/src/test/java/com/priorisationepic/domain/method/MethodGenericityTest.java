package com.priorisationepic.domain.method;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.testmethod.FakeTwoCriteriaMethod;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class MethodGenericityTest {

  private static final SessionId SESSION = new SessionId("b".repeat(22));
  private static final FakeTwoCriteriaMethod FAKE = new FakeTwoCriteriaMethod();
  private static final MethodRegistry REGISTRY =
      new MethodRegistry(List.of(new WsjfMethod(), FAKE), "WSJF");

  private static Feature fake(String id, Integer reach, Integer effort) {
    java.util.HashMap<String, Integer> values = new java.util.HashMap<>();
    values.put("reach", reach);
    values.put("effort", effort);
    return Feature.create(
        UUID.randomUUID(),
        SESSION,
        id,
        "t",
        null,
        new Criteria(FAKE.definition(), values),
        Scale.defaultScale());
  }

  @Test
  void registryFindsMethodByKeyAndVersion() {
    assertThat(REGISTRY.get("WSJF", 1)).isInstanceOf(WsjfMethod.class);
    assertThat(REGISTRY.get("FAKE", 1)).isSameAs(FAKE);
  }

  @Test
  void registryRefusesUnknownMethodOrVersion() {
    assertThatThrownBy(() -> REGISTRY.get("WSJF", 2)).isInstanceOf(UnknownMethodException.class);
    assertThatThrownBy(() -> REGISTRY.get("WSJF", 0)).isInstanceOf(UnknownMethodException.class);
    assertThatThrownBy(() -> REGISTRY.get("RICE", 1)).isInstanceOf(UnknownMethodException.class);
    assertThatThrownBy(() -> REGISTRY.get(null, 1)).isInstanceOf(UnknownMethodException.class);
    assertThatThrownBy(() -> REGISTRY.latest("RICE")).isInstanceOf(UnknownMethodException.class);
  }

  @Test
  void registryKeepsOldVersionsButOffersOnlyTheLatest() {
    PrioritizationMethod v2 = new FakeV2();
    MethodRegistry registry = new MethodRegistry(List.of(FAKE, v2, new WsjfMethod()), "WSJF");
    assertThat(registry.get("FAKE", 1)).isSameAs(FAKE);
    assertThat(registry.get("FAKE", 2)).isSameAs(v2);
    assertThat(registry.latest("FAKE")).isSameAs(v2);
    assertThat(registry.available()).hasSize(2).contains(v2).doesNotContain(FAKE);
    assertThat(registry.defaultMethod().definition().key()).isEqualTo("WSJF");
  }

  @Test
  void registryRefusesDuplicatesAndMissingDefault() {
    List<PrioritizationMethod> twice = List.of(FAKE, FAKE);
    assertThatThrownBy(() -> new MethodRegistry(twice, "FAKE"))
        .isInstanceOf(IllegalArgumentException.class);
    List<PrioritizationMethod> one = List.of(FAKE);
    assertThatThrownBy(() -> new MethodRegistry(one, "WSJF"))
        .isInstanceOf(UnknownMethodException.class);
  }

  @Test
  void standardRegistryOffersWsjfOnly() {
    MethodRegistry standard = MethodRegistry.standard();
    assertThat(standard.available()).hasSize(1);
    assertThat(standard.defaultMethod().definition().key()).isEqualTo("WSJF");
    assertThat(standard.defaultMethod().definition().version()).isEqualTo(1);
  }

  @Test
  void criteriaAcceptsOnlyTheMethodKeys() {
    Criteria ok = new Criteria(FAKE.definition(), Map.of("reach", 3, "effort", 2));
    assertThat(ok.value("reach")).hasValue(3);
    assertThatThrownBy(() -> new Criteria(FAKE.definition(), Map.of("bv", 3)))
        .isInstanceOf(UnknownCriterionException.class)
        .hasMessageContaining("bv");
    assertThatThrownBy(() -> new Criteria(new WsjfMethod().definition(), Map.of("reach", 3)))
        .isInstanceOf(UnknownCriterionException.class);
  }

  @Test
  void scoreAndRankingWorkForTheFakeMethodWithoutWsjfCode() {
    Scale scale = Scale.defaultScale();
    Feature low = fake("A", 2, 4);
    Feature high = fake("B", 9, 3);
    Feature incomplete = fake("C", 5, null);
    List<RankedFeature> ranked = Ranking.rank(FAKE, scale, List.of(incomplete, low, high));
    assertThat(ranked.stream().map(r -> r.feature().externalId()).toList())
        .containsExactly("B", "A", "C");
    assertThat(ranked.get(0).score().computed()).containsOnlyKeys("ratio");
    assertThat(ranked.get(0).score().computed().get("ratio").display()).isEqualTo("3,00");
    assertThat(ranked.get(0).score().explanation()).hasValue("RA = 3,00");
    assertThat(ranked.get(2).score().complete()).isFalse();
    assertThat(ranked.get(2).score().computed()).isEmpty();
    assertThat(ranked.get(2).score().explanation()).isEmpty();
  }

  @Test
  void wsjfDefinitionMatchesTheDataModelTable() {
    MethodDefinition def = new WsjfMethod().definition();
    assertThat(def.key()).isEqualTo("WSJF");
    assertThat(def.version()).isEqualTo(1);
    assertThat(def.name()).isEqualTo("WSJF");
    assertThat(def.formula()).isEqualTo("CoD = BV + TC + RR/OE ; WSJF = CoD / JS");
    assertThat(def.tieBreakRule()).isNotBlank();
    assertThat(def.criteria())
        .containsExactly(
            new CriterionDefinition(
                "bv",
                "BV",
                "Business Value",
                "Valeur apportée aux utilisateurs ou au business.",
                "BV"),
            new CriterionDefinition(
                "tc",
                "TC",
                "Time Criticality",
                "Importance de réaliser rapidement la fonctionnalité.",
                "TC"),
            new CriterionDefinition(
                "rrOe",
                "RR/OE",
                "Risk Reduction / Opportunity Enablement",
                "Capacité à réduire un risque ou à permettre une opportunité.",
                "RR/OE"),
            new CriterionDefinition(
                "js", "JS", "Job Size", "Taille relative du travail nécessaire.", "JS"));
    assertThat(def.computedValues())
        .containsExactly(
            new ComputedValueDefinition(
                "cod",
                "CoD",
                "Cost of Delay",
                "Coût du retard : BV + TC + RR/OE.",
                "CoD",
                Display.INTEGER),
            new ComputedValueDefinition(
                "wsjf",
                "WSJF",
                "Weighted Shortest Job First",
                "CoD / JS. Plus il est élevé, plus la fonctionnalité est prioritaire.",
                "WSJF",
                Display.DECIMAL_2));
  }

  @Test
  void definitionRejectsDuplicateOrBlankKeys() {
    List<CriterionDefinition> dup =
        List.of(
            new CriterionDefinition("a", "A", "A", "d", "A"),
            new CriterionDefinition("a", "B", "B", "d", "B"));
    assertThatThrownBy(() -> new MethodDefinition("K", 1, "K", dup, List.of(), "f", "t"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new MethodDefinition("K", 1, "K", List.of(), List.of(), "f", "t"))
        .isInstanceOf(IllegalArgumentException.class);
    List<CriterionDefinition> one = List.of(new CriterionDefinition("a", "A", "A", "d", "A"));
    assertThatThrownBy(() -> new MethodDefinition("K", 0, "K", one, List.of(), "f", "t"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new MethodDefinition(" ", 1, "K", one, List.of(), "f", "t"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new CriterionDefinition("", "A", "A", "d", "A"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new ComputedValueDefinition("k", "A", "A", "d", "A", null))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void everyDefinitionFieldIsRequired() {
    String[] ok = {"k", "c", "l", "d", "h"};
    for (int blank = 0; blank < 5; blank++) {
      String[] f = ok.clone();
      f[blank] = " ";
      assertThatThrownBy(() -> new CriterionDefinition(f[0], f[1], f[2], f[3], f[4]))
          .isInstanceOf(IllegalArgumentException.class);
      assertThatThrownBy(
              () -> new ComputedValueDefinition(f[0], f[1], f[2], f[3], f[4], Display.INTEGER))
          .isInstanceOf(IllegalArgumentException.class);
    }
    List<CriterionDefinition> one = List.of(new CriterionDefinition("a", "A", "A", "d", "A"));
    assertThatThrownBy(() -> new MethodDefinition("K", 1, " ", one, List.of(), "f", "t"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new MethodDefinition("K", 1, "K", one, List.of(), " ", "t"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new MethodDefinition("K", 1, "K", one, List.of(), "f", " "))
        .isInstanceOf(IllegalArgumentException.class);
    assertThat(new MethodDefinition("K", 1, "K", one, List.of(), "f", "t").version()).isEqualTo(1);
  }

  @Test
  void aComputedKeyCannotReuseACriterionKey() {
    List<CriterionDefinition> one = List.of(new CriterionDefinition("a", "A", "A", "d", "A"));
    List<ComputedValueDefinition> clash =
        List.of(new ComputedValueDefinition("a", "A", "A", "d", "A", Display.INTEGER));
    assertThatThrownBy(() -> new MethodDefinition("K", 1, "K", one, clash, "f", "t"))
        .isInstanceOf(IllegalArgumentException.class);
  }

  /** Nouvelle version de la méthode fictive, pour vérifier la cohabitation des versions. */
  private static final class FakeV2 implements PrioritizationMethod {
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
    public java.util.Optional<Map<String, Fraction>> compute(Criteria criteria) {
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
  }
}
