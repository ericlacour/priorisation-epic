package com.priorisationepic.application;

/** Le pseudo est déjà utilisé dans la session par un participant qui n'est pas absent : 409. */
public final class PseudoTakenException extends RuntimeException {

  public PseudoTakenException() {
    super("Pseudo déjà utilisé");
  }
}
