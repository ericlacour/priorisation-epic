package com.priorisationepic.domain.scale;

import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.method.Criteria;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

/**
 * Échelle de saisie d'une session (FR-009, FR-010).
 *
 * <ul>
 *   <li>{@link ScaleType#CONTINUOUS} : les entiers de 1 à {@code max}, avec {@code max} de 2 à 100
 *       (10 par défaut) ;
 *   <li>{@link ScaleType#FIBONACCI} : les valeurs de la suite SAFe {1, 2, 3, 5, 8, 13, 20, 40, 100}
 *       jusqu'à {@code max}, qui appartient à la suite (20 par défaut).
 * </ul>
 *
 * La plus petite valeur vaut toujours 1, donc un diviseur n'est jamais nul.
 */
public record Scale(ScaleType type, int max) {

  public static final int MIN_MAX = 2;
  public static final int MAX_MAX = 100;
  public static final int DEFAULT_MAX = 10;
  public static final int DEFAULT_FIBONACCI_MAX = 20;

  /** La suite de Fibonacci SAFe. */
  public static final List<Integer> FIBONACCI_VALUES = List.of(1, 2, 3, 5, 8, 13, 20, 40, 100);

  /** Les bornes possibles d'une échelle de Fibonacci : les valeurs de la suite à partir de 2. */
  public static final List<Integer> FIBONACCI_BOUNDS = FIBONACCI_VALUES.subList(1, 9);

  public Scale {
    Objects.requireNonNull(type, "type");
    if (type == ScaleType.FIBONACCI && !FIBONACCI_BOUNDS.contains(max)) {
      throw new InvalidValueException(
          "La borne d'une échelle de Fibonacci est l'une des valeurs "
              + join(FIBONACCI_BOUNDS)
              + ".");
    }
    if (max < MIN_MAX || max > MAX_MAX) {
      throw new InvalidValueException("Le maximum de l'échelle doit être compris entre 2 et 100.");
    }
  }

  /** L'échelle d'une nouvelle session : de 1 à 10. */
  public static Scale defaultScale() {
    return new Scale(ScaleType.CONTINUOUS, DEFAULT_MAX);
  }

  /** L'échelle par défaut d'un type : 1 à 10 en continu, Fibonacci jusqu'à 20. */
  public static Scale defaultFor(ScaleType type) {
    return type == ScaleType.FIBONACCI
        ? new Scale(ScaleType.FIBONACCI, DEFAULT_FIBONACCI_MAX)
        : defaultScale();
  }

  /** Vrai si {@code value} est une valeur de l'échelle. */
  public boolean accepts(int value) {
    if (value < 1 || value > max) {
      return false;
    }
    return type == ScaleType.CONTINUOUS || FIBONACCI_VALUES.contains(value);
  }

  /** Vrai si {@code value} est une valeur de l'échelle ({@code false} pour {@code null}). */
  public boolean accepts(Integer value) {
    return value != null && accepts(value.intValue());
  }

  /** Toutes les valeurs de l'échelle, dans l'ordre croissant. */
  public List<Integer> allowedValues() {
    if (type == ScaleType.FIBONACCI) {
      return FIBONACCI_VALUES.stream().filter(value -> value <= max).toList();
    }
    return IntStream.rangeClosed(1, max).boxed().toList();
  }

  /** Refuse une valeur hors échelle ; le message liste les valeurs autorisées en Fibonacci. */
  public void requireAccepted(int value) {
    if (!accepts(value)) {
      String allowed =
          type == ScaleType.FIBONACCI
              ? " Valeurs autorisées : " + join(allowedValues()) + "."
              : " Valeurs autorisées : de 1 à " + max + ".";
      throw new InvalidValueException("La valeur " + value + " est hors de l'échelle." + allowed);
    }
  }

  /** Une valeur retenue que le passage à une autre échelle met hors échelle (FR-011). */
  public record Impact(String externalId, String criterionKey, int value) {}

  /**
   * Les valeurs retenues de {@code features} acceptées par cette échelle mais pas par {@code
   * newScale}, dans l'ordre des fonctionnalités puis des critères. Une valeur déjà hors échelle
   * n'est pas un nouvel impact.
   */
  public List<Impact> impactOf(Scale newScale, Collection<Feature> features) {
    List<Impact> impacts = new ArrayList<>();
    for (Feature feature : features) {
      Criteria criteria = feature.criteria();
      for (Map.Entry<String, Integer> entry : criteria.asMap().entrySet()) {
        int value = entry.getValue();
        if (accepts(value) && !newScale.accepts(value)) {
          impacts.add(new Impact(feature.externalId(), entry.getKey(), value));
        }
      }
    }
    return impacts;
  }

  private static String join(List<Integer> values) {
    return values.stream().map(String::valueOf).collect(Collectors.joining(", "));
  }
}
