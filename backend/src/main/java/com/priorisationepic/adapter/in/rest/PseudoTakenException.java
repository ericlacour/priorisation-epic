package com.priorisationepic.adapter.in.rest;

/** Pseudo déjà utilisé et non reprenable : 409 {@code problem+json}. */
class PseudoTakenException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  PseudoTakenException() {
    super("Pseudo taken.");
  }
}
