package com.priorisationepic.domain.scale;

/** Une valeur de critère n'appartient pas à l'échelle de la session (FR-009, FR-010). */
public final class InvalidValueException extends IllegalArgumentException {

  public InvalidValueException(String message) {
    super(message);
  }
}
