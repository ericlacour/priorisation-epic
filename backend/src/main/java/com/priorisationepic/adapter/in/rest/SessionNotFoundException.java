package com.priorisationepic.adapter.in.rest;

/** Session inconnue, ou identifiant qui n'a pas la forme du contrat : 404 {@code problem+json}. */
class SessionNotFoundException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  SessionNotFoundException() {
    super("Session not found.");
  }
}
