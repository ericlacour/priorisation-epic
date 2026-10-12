package com.priorisationepic.domain.scale;

import java.math.BigDecimal;
import java.util.List;
import java.util.stream.IntStream;

/**
 * Échelle de saisie d'une session. En continu, les valeurs permises sont les entiers de 1 à {@code
 * max}, avec {@code max} de 2 à 100 (10 par défaut).
 */
public record Scale(ScaleType type, int max) {

  public static final int MIN_MAX = 2;
  public static final int MAX_MAX = 100;
  public static final int DEFAULT_MAX = 10;

  public Scale {
    if (type == null) {
      throw new InvalidScaleException("Type d'échelle manquant");
    }
    if (max < MIN_MAX || max > MAX_MAX) {
      throw new InvalidScaleException(
          "La borne de l'échelle doit être comprise entre " + MIN_MAX + " et " + MAX_MAX);
    }
  }

  /** Échelle continue de 1 à {@code max}. */
  public static Scale continuous(int max) {
    return new Scale(ScaleType.CONTINUOUS, max);
  }

  /** Échelle par défaut : continue, de 1 à 10. */
  public static Scale defaultScale() {
    return continuous(DEFAULT_MAX);
  }

  /** Vrai si {@code value} appartient à l'échelle. */
  public boolean accepts(int value) {
    return value >= 1 && value <= max;
  }

  /** Vrai si {@code value} est un entier de l'échelle (une valeur non entière est refusée). */
  public boolean accepts(BigDecimal value) {
    if (value == null) {
      return false;
    }
    try {
      return accepts(value.intValueExact());
    } catch (ArithmeticException notAnInt) {
      return false;
    }
  }

  /** Les valeurs permises, dans l'ordre croissant. */
  public List<Integer> allowedValues() {
    return IntStream.rangeClosed(1, max).boxed().toList();
  }
}
