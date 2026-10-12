package com.priorisationepic.domain;

/** Champ de session invalide : nom vide ou de plus de 120 caractères. */
public class InvalidSessionException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  public InvalidSessionException(String message) {
    super(message);
  }
}
