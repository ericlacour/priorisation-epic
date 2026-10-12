package com.priorisationepic.testmethod;

import com.priorisationepic.domain.method.ComputedValueDefinition;
import com.priorisationepic.domain.method.Criteria;
import com.priorisationepic.domain.method.CriterionDefinition;
import com.priorisationepic.domain.method.Display;
import com.priorisationepic.domain.method.Fraction;
import com.priorisationepic.domain.method.MethodDefinition;
import com.priorisationepic.domain.method.PrioritizationMethod;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Méthode fictive de test (FR-017b, SC-009) : ratio = reach / effort, tri par ratio décroissant.
 */
public final class FakeTwoCriteriaMethod implements PrioritizationMethod {

  public static final String KEY = "FAKE";

  private static final MethodDefinition DEFINITION =
      new MethodDefinition(
          KEY,
          1,
          "Fictive",
          List.of(
              new CriterionDefinition("reach", "RE", "Reach", "Portée.", "Reach"),
              new CriterionDefinition("effort", "EF", "Effort", "Effort.", "Effort")),
          List.of(
              new ComputedValueDefinition(
                  "ratio", "RA", "Ratio", "Reach / Effort.", "Ratio", Display.DECIMAL_2)),
          "RA = RE / EF",
          "Ratio décroissant.");

  @Override
  public MethodDefinition definition() {
    return DEFINITION;
  }

  @Override
  public Optional<Map<String, Fraction>> compute(Criteria criteria) {
    if (criteria.value("reach").isEmpty() || criteria.value("effort").isEmpty()) {
      return Optional.empty();
    }
    return Optional.of(
        Map.of(
            "ratio",
            Fraction.of(criteria.value("reach").getAsInt(), criteria.value("effort").getAsInt())));
  }

  @Override
  public String explain(Criteria criteria) {
    Map<String, Fraction> computed = compute(criteria).orElseThrow();
    return "RA = " + computed.get("ratio").format(Display.DECIMAL_2);
  }

  @Override
  public int compare(Map<String, Fraction> a, Map<String, Fraction> b) {
    return b.get("ratio").compareTo(a.get("ratio"));
  }
}
