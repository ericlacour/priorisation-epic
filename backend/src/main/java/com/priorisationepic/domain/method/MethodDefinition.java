package com.priorisationepic.domain.method;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Définition d'une méthode, envoyée telle quelle au front : critères saisis et valeurs calculées
 * dans l'ordre d'affichage, formule et règle de tri affichées.
 */
public record MethodDefinition(
    String key,
    int version,
    String name,
    List<CriterionDefinition> criteria,
    List<ComputedValueDefinition> computedValues,
    String formula,
    String tieBreakRule) {

  public MethodDefinition {
    requireText(key, "key");
    requireText(name, "name");
    requireText(formula, "formula");
    requireText(tieBreakRule, "tieBreakRule");
    if (version < 1) {
      throw new IllegalArgumentException("La version doit être au moins 1");
    }
    if (criteria == null || criteria.isEmpty()) {
      throw new IllegalArgumentException("Une méthode a au moins un critère");
    }
    criteria = List.copyOf(criteria);
    computedValues = List.copyOf(computedValues);
    Set<String> keys = new HashSet<>();
    for (CriterionDefinition c : criteria) {
      if (!keys.add(c.key())) {
        throw new IllegalArgumentException("Clé de critère en double : " + c.key());
      }
    }
    for (ComputedValueDefinition v : computedValues) {
      if (!keys.add(v.key())) {
        throw new IllegalArgumentException("Clé en double : " + v.key());
      }
    }
  }

  /** Vrai si {@code criterionKey} est une clé de critère saisi de cette méthode. */
  public boolean hasCriterion(String criterionKey) {
    return criteria.stream().anyMatch(c -> c.key().equals(criterionKey));
  }

  /** Les clés des critères saisis, dans l'ordre d'affichage. */
  public List<String> criterionKeys() {
    return criteria.stream().map(CriterionDefinition::key).toList();
  }

  static void requireText(String value, String field) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(field + " manquant");
    }
  }
}
