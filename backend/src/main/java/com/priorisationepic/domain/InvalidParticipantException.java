package com.priorisationepic.domain;

/** Champ de participant invalide : rôle métier de plus de 40 caractères. */
public class InvalidParticipantException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  public InvalidParticipantException(String message) {
    super(message);
  }
}
