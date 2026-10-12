package com.priorisationepic.application;

/**
 * Un champ d'une intention de modification : absent (on n'y touche pas) ou présent, avec une valeur
 * qui peut être {@code null} (effacer).
 */
public record Change<T>(boolean present, T value) {

  private static final Change<?> ABSENT = new Change<>(false, null);

  @SuppressWarnings("unchecked")
  public static <T> Change<T> absent() {
    return (Change<T>) ABSENT;
  }

  public static <T> Change<T> set(T value) {
    return new Change<>(true, value);
  }
}
