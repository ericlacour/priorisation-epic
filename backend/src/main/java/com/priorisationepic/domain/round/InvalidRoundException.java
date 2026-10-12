package com.priorisationepic.domain.round;

/** Tour invalide : aucune fonctionnalité, ou fonctionnalité en double. */
public class InvalidRoundException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  public InvalidRoundException(String message) {
    super(message);
  }
}
