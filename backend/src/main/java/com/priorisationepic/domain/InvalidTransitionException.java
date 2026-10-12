package com.priorisationepic.domain;

/** Changement de statut de session interdit. */
public class InvalidTransitionException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  public InvalidTransitionException(SessionStatus from, SessionStatus to) {
    super("Transition interdite : " + from + " vers " + to);
  }
}
