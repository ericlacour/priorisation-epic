package com.priorisationepic.domain.method;

import com.priorisationepic.domain.scale.Scale;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Résultat du calcul d'une fonctionnalité. {@code complete} vaut vrai quand la méthode a pu
 * calculer et qu'aucune valeur n'est hors échelle ; sinon {@code computed} est vide. {@code rank}
 * vaut 0 tant que {@link Ranking} ne l'a pas attribué.
 */
public record Score(
    boolean complete,
    List<String> outOfScale,
    Map<String, ComputedValue> computed,
    Optional<String> explanation,
    int rank) {

  public Score {
    outOfScale = List.copyOf(outOfScale);
    computed = java.util.Collections.unmodifiableMap(new LinkedHashMap<>(computed));
  }

  /** Calcule le score de ces critères sur cette échelle. */
  public static Score of(PrioritizationMethod method, Criteria criteria, Scale scale) {
    List<String> outOfScale =
        criteria.values().entrySet().stream()
            .filter(e -> !scale.accepts(e.getValue()))
            .map(Map.Entry::getKey)
            .toList();
    Optional<Map<String, Fraction>> exact =
        outOfScale.isEmpty() ? method.compute(criteria) : Optional.empty();
    if (exact.isEmpty()) {
      return new Score(false, outOfScale, Map.of(), Optional.empty(), 0);
    }
    Map<String, ComputedValue> computed = new LinkedHashMap<>();
    for (ComputedValueDefinition def : method.definition().computedValues()) {
      Fraction value = exact.get().get(def.key());
      computed.put(def.key(), new ComputedValue(value, value.format(def.display())));
    }
    return new Score(true, outOfScale, computed, Optional.of(method.explain(criteria)), 0);
  }

  /** Les fractions exactes par clé (vide si la fonctionnalité n'est pas complète). */
  public Map<String, Fraction> exact() {
    Map<String, Fraction> exact = new LinkedHashMap<>();
    computed.forEach((key, value) -> exact.put(key, value.exact()));
    return exact;
  }

  public Score withRank(int newRank) {
    return new Score(complete, outOfScale, computed, explanation, newRank);
  }
}
