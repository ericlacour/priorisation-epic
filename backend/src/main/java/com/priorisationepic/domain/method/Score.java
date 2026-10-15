package com.priorisationepic.domain.method;

import com.priorisationepic.domain.scale.Scale;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Score d'une fonctionnalité : calculé par le domaine seul, jamais saisi (constitution I).
 *
 * <p>{@code complete} : assez de critères renseignés pour calculer ({@link
 * PrioritizationMethod#computable(Criteria)}) et tous les critères renseignés dans l'échelle.
 * {@code outOfScale} : les critères renseignés mais hors de l'échelle courante. {@code computed} et
 * {@code explanation} n'existent que si {@code complete}. {@code rank} est posé par {@link
 * Ranking}.
 */
public record Score(
    boolean complete,
    List<String> outOfScale,
    Map<String, Fraction> computed,
    String explanation,
    Integer rank) {

  public Score {
    outOfScale = List.copyOf(outOfScale);
    if (complete) {
      Objects.requireNonNull(computed, "computed");
      Objects.requireNonNull(explanation, "explanation");
      computed = Map.copyOf(computed);
    } else if (computed != null || explanation != null) {
      throw new IllegalArgumentException("Un score incomplet n'a ni valeurs ni explication.");
    }
  }

  /** Le score de {@code criteria} pour {@code method} sur {@code scale}, sans rang. */
  public static Score of(PrioritizationMethod method, Criteria criteria, Scale scale) {
    List<String> outOfScale = new ArrayList<>();
    for (CriterionDefinition criterion : method.definition().criteria()) {
      Integer value = criteria.get(criterion.key());
      if (value != null && !scale.accepts(value)) {
        outOfScale.add(criterion.key());
      }
    }
    if (!method.computable(criteria) || !outOfScale.isEmpty()) {
      return new Score(false, outOfScale, null, null, null);
    }
    return new Score(
        true, outOfScale, order(method, method.compute(criteria)), method.explain(criteria), null);
  }

  /** Les valeurs calculées dans l'ordre de la définition. */
  private static Map<String, Fraction> order(
      PrioritizationMethod method, Map<String, Fraction> raw) {
    Map<String, Fraction> ordered = new java.util.LinkedHashMap<>();
    for (ComputedValueDefinition definition : method.definition().computedValues()) {
      ordered.put(definition.key(), raw.get(definition.key()));
    }
    return ordered;
  }

  public Score withRank(int rank) {
    return new Score(complete, outOfScale, computed, explanation, rank);
  }
}
