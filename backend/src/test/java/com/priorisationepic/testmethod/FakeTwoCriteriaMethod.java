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

/**
 * Méthode fictive, déclarée dans les tests seulement (FR-017a, SC-009) : deux critères, {@code
 * reach} et {@code effort}, et une valeur calculée {@code ratio} = reach / effort, triée par ratio
 * décroissant. Elle prouve que le domaine et le front ne dépendent d'aucun critère du WSJF.
 */
public final class FakeTwoCriteriaMethod implements PrioritizationMethod {

  public static final String KEY = "REACH";

  private static final MethodDefinition DEFINITION =
      new MethodDefinition(
          KEY,
          1,
          "Reach / Effort",
          List.of(
              new CriterionDefinition(
                  "reach", "Reach", "Reach", "Nombre de personnes touchées.", "Reach"),
              new CriterionDefinition(
                  "effort", "Effort", "Effort", "Effort nécessaire.", "Effort")),
          List.of(
              new ComputedValueDefinition(
                  "ratio",
                  "Ratio",
                  "Reach / Effort",
                  "Reach divisé par Effort.",
                  "Ratio",
                  Display.DECIMAL_2)),
          "Ratio = Reach / Effort",
          "Ratio décroissant, puis identifiant croissant.");

  @Override
  public MethodDefinition definition() {
    return DEFINITION;
  }

  @Override
  public Map<String, Fraction> compute(Criteria criteria) {
    return Map.of("ratio", Fraction.of(criteria.get("reach"), criteria.get("effort")));
  }

  @Override
  public String explain(Criteria criteria) {
    return "Ratio = " + criteria.get("reach") + " / " + criteria.get("effort");
  }

  @Override
  public int compare(Map<String, Fraction> a, Map<String, Fraction> b) {
    return b.get("ratio").compareTo(a.get("ratio"));
  }
}
