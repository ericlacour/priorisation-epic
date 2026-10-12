package com.priorisationepic.domain.scale;

/** Échelle invalide : type absent ou borne hors de 2 à 100. */
public class InvalidScaleException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  public InvalidScaleException(String message) {
    super(message);
  }
}
