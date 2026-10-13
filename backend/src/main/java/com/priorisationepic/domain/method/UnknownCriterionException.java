package com.priorisationepic.domain.method;

/** Une clé de critère que la méthode de la session ne déclare pas (UNKNOWN_CRITERION). */
public final class UnknownCriterionException extends IllegalArgumentException {

  private final String key;

  public UnknownCriterionException(String key) {
    super("Critère inconnu de la méthode : " + key);
    this.key = key;
  }

  public String key() {
    return key;
  }
}
