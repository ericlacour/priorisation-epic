package com.priorisationepic.application;

/**
 * Champ facultatif d'une modification : absent (on ne touche pas au champ) ou présent, avec une
 * valeur éventuellement {@code null} (on efface le champ).
 */
public record Patch<T>(boolean present, T value) {

  private static final Patch<?> ABSENT = new Patch<>(false, null);

  @SuppressWarnings("unchecked")
  public static <T> Patch<T> absent() {
    return (Patch<T>) ABSENT;
  }

  public static <T> Patch<T> of(T value) {
    return new Patch<>(true, value);
  }
}
