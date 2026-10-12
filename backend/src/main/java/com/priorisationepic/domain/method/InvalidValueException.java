package com.priorisationepic.domain.method;

/** Valeur de critère invalide : pas un entier ≥ 1, ou hors de l'échelle ({@code INVALID_VALUE}). */
public class InvalidValueException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  public InvalidValueException(String message) {
    super(message);
  }
}
