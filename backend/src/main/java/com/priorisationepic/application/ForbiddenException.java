package com.priorisationepic.application;

/** Action réservée à l'animateur, ou session clôturée (REST : 403). */
public final class ForbiddenException extends RuntimeException {

  public ForbiddenException() {
    super("forbidden");
  }
}
