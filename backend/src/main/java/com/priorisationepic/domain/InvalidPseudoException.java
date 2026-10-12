package com.priorisationepic.domain;

/** Pseudo vide ou de plus de 40 caractères. */
public class InvalidPseudoException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  public InvalidPseudoException() {
    super("Invalid pseudo");
  }
}
