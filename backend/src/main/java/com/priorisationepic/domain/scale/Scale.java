package com.priorisationepic.domain.scale;

import java.util.List;
import java.util.Objects;
import java.util.stream.IntStream;

/**
 * Échelle de saisie d'une session (FR-009, FR-010). Le seul type de ce stade est {@link
 * ScaleType#CONTINUOUS} : les entiers de 1 à {@code max}, avec {@code max} de 2 à 100 (10 par
 * défaut). La plus petite valeur vaut toujours 1, donc un diviseur n'est jamais nul.
 */
public record Scale(ScaleType type, int max) {

  public static final int MIN_MAX = 2;
  public static final int MAX_MAX = 100;
  public static final int DEFAULT_MAX = 10;

  public Scale {
    Objects.requireNonNull(type, "type");
    if (max < MIN_MAX || max > MAX_MAX) {
      throw new InvalidValueException("Le maximum de l'échelle doit être compris entre 2 et 100.");
    }
  }

  /** L'échelle d'une nouvelle session : de 1 à 10. */
  public static Scale defaultScale() {
    return new Scale(ScaleType.CONTINUOUS, DEFAULT_MAX);
  }

  /** Vrai si {@code value} est une valeur de l'échelle. */
  public boolean accepts(int value) {
    return value >= 1 && value <= max;
  }

  /** Vrai si {@code value} est une valeur de l'échelle ({@code false} pour {@code null}). */
  public boolean accepts(Integer value) {
    return value != null && accepts(value.intValue());
  }

  /** Toutes les valeurs de l'échelle, dans l'ordre croissant. */
  public List<Integer> allowedValues() {
    return IntStream.rangeClosed(1, max).boxed().toList();
  }

  /** Refuse une valeur hors échelle. */
  public void requireAccepted(int value) {
    if (!accepts(value)) {
      throw new InvalidValueException("La valeur " + value + " est hors de l'échelle.");
    }
  }
}
