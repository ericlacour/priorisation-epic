package com.priorisationepic.domain.method;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Valeurs saisies par clé de critère, validées contre la définition de la méthode (FR-017b) : une
 * clé inconnue est refusée ({@link UnknownCriterionException}). Un critère non renseigné n'a pas
 * d'entrée. Les valeurs sont des entiers ≥ 1 ; leur appartenance à l'échelle est vérifiée à
 * l'écriture par {@code Scale}, et recalculée à la lecture (hors échelle).
 */
public final class Criteria {

  private final Map<String, Integer> values;

  private Criteria(Map<String, Integer> values) {
    this.values = Collections.unmodifiableMap(values);
  }

  /** Aucune valeur saisie. */
  public static Criteria empty() {
    return new Criteria(new LinkedHashMap<>());
  }

  /**
   * Valeurs de {@code input} (une valeur {@code null} signifie « non renseigné »), dans l'ordre des
   * critères de la définition.
   */
  public static Criteria of(MethodDefinition definition, Map<String, Integer> input) {
    for (String key : input.keySet()) {
      if (!definition.hasCriterion(key)) {
        throw new UnknownCriterionException(key);
      }
    }
    Map<String, Integer> ordered = new LinkedHashMap<>();
    for (CriterionDefinition criterion : definition.criteria()) {
      Integer value = input.get(criterion.key());
      if (value != null) {
        if (value < 1) {
          throw new IllegalArgumentException("Une valeur de critère est un entier d'au moins 1.");
        }
        ordered.put(criterion.key(), value);
      }
    }
    return new Criteria(ordered);
  }

  /** La valeur du critère, ou {@code null} s'il n'est pas renseigné. */
  public Integer get(String key) {
    return values.get(key);
  }

  public boolean isEntered(String key) {
    return values.containsKey(key);
  }

  /** Clés renseignées, dans l'ordre de la définition. */
  public Set<String> keys() {
    return values.keySet();
  }

  /** Copie immuable des valeurs renseignées. */
  public Map<String, Integer> asMap() {
    return values;
  }

  /**
   * Ces valeurs, modifiées par {@code changes} : une clé présente remplace la valeur, une valeur
   * {@code null} l'efface. Les autres clés ne changent pas.
   */
  public Criteria with(MethodDefinition definition, Map<String, Integer> changes) {
    Map<String, Integer> merged = new LinkedHashMap<>(values);
    for (Map.Entry<String, Integer> change : changes.entrySet()) {
      if (change.getValue() == null) {
        merged.remove(change.getKey());
      } else {
        merged.put(change.getKey(), change.getValue());
      }
    }
    return of(definition, merged);
  }

  @Override
  public boolean equals(Object other) {
    return other instanceof Criteria criteria && values.equals(criteria.values);
  }

  @Override
  public int hashCode() {
    return values.hashCode();
  }

  @Override
  public String toString() {
    return values.toString();
  }
}
