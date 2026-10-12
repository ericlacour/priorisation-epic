package com.priorisationepic.domain.method;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.OptionalInt;

/**
 * Valeurs saisies par clé de critère, validées contre la définition de la méthode. Un critère non
 * renseigné est absent. Immuable.
 */
public record Criteria(MethodDefinition definition, Map<String, Integer> values) {

  public Criteria {
    LinkedHashMap<String, Integer> ordered = new LinkedHashMap<>();
    for (String key : values.keySet()) {
      if (!definition.hasCriterion(key)) {
        throw new UnknownCriterionException(key);
      }
    }
    for (String key : definition.criterionKeys()) {
      Integer value = values.get(key);
      if (value != null) {
        if (value < 1) {
          throw new InvalidValueException("La valeur de " + key + " doit être un entier ≥ 1");
        }
        ordered.put(key, value);
      }
    }
    values = java.util.Collections.unmodifiableMap(ordered);
  }

  public static Criteria empty(MethodDefinition definition) {
    return new Criteria(definition, Map.of());
  }

  /** La valeur du critère, vide s'il n'est pas renseigné. */
  public OptionalInt value(String key) {
    if (!definition.hasCriterion(key)) {
      throw new UnknownCriterionException(key);
    }
    Integer value = values.get(key);
    return value == null ? OptionalInt.empty() : OptionalInt.of(value);
  }

  /** Copie avec ce critère modifié ; {@code null} le retire. */
  public Criteria with(String key, Integer value) {
    Map<String, Integer> copy = new LinkedHashMap<>(values);
    if (value == null) {
      copy.remove(key);
    } else {
      copy.put(key, value);
    }
    return new Criteria(definition, copy);
  }
}
