package com.priorisationepic.domain.method;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * Définition d'une méthode, envoyée telle quelle au front (FR-017a) : c'est la seule source des
 * colonnes, des champs de saisie, des sigles et des aides.
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
    Objects.requireNonNull(key, "key");
    Objects.requireNonNull(name, "name");
    Objects.requireNonNull(formula, "formula");
    Objects.requireNonNull(tieBreakRule, "tieBreakRule");
    if (version < 1) {
      throw new IllegalArgumentException("La version d'une méthode commence à 1.");
    }
    criteria = List.copyOf(criteria);
    computedValues = List.copyOf(computedValues);
    if (criteria.isEmpty()) {
      throw new IllegalArgumentException("Une méthode a au moins un critère.");
    }
    long distinct =
        java.util.stream.Stream.concat(
                criteria.stream().map(CriterionDefinition::key),
                computedValues.stream().map(ComputedValueDefinition::key))
            .distinct()
            .count();
    if (distinct != criteria.size() + computedValues.size()) {
      throw new IllegalArgumentException("Les clés d'une méthode sont uniques.");
    }
  }

  /** Vrai si {@code criterionKey} est un critère saisi de la méthode. */
  public boolean hasCriterion(String criterionKey) {
    return criterion(criterionKey).isPresent();
  }

  public Optional<CriterionDefinition> criterion(String criterionKey) {
    return criteria.stream().filter(c -> c.key().equals(criterionKey)).findFirst();
  }

  public Optional<ComputedValueDefinition> computedValue(String computedKey) {
    return computedValues.stream().filter(c -> c.key().equals(computedKey)).findFirst();
  }
}
