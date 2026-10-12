package com.priorisationepic.domain.method;

/** Clé de critère inconnue de la méthode (code d'erreur {@code UNKNOWN_CRITERION}). */
public class UnknownCriterionException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  private final String key;

  public UnknownCriterionException(String key) {
    super("Critère inconnu : " + key);
    this.key = key;
  }

  public String key() {
    return key;
  }
}
