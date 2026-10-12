package com.priorisationepic.domain.method;

/** Méthode ou version de méthode inconnue du {@link MethodRegistry}. */
public class UnknownMethodException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  public UnknownMethodException(String key, int version) {
    super("Méthode inconnue : " + key + " version " + version);
  }

  public UnknownMethodException(String key) {
    super("Méthode inconnue : " + key);
  }
}
