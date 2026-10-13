package com.priorisationepic.domain.method;

/** Méthode (ou version de méthode) absente du {@link MethodRegistry}. */
public final class UnknownMethodException extends IllegalArgumentException {

  public UnknownMethodException(String key, Integer version) {
    super(
        version == null
            ? "Méthode inconnue : " + key
            : "Méthode inconnue : " + key + " v" + version);
  }
}
