package com.priorisationepic.domain.round;

/** Un tour révélé est immuable : il n'accepte plus de vote (FR-020). */
public class RoundRevealedException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  public RoundRevealedException() {
    super("Le tour est révélé");
  }
}
