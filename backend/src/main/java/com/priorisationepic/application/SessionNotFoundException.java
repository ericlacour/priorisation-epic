package com.priorisationepic.application;

/** La session n'existe pas (ou l'identifiant est mal formé) : 404. */
public final class SessionNotFoundException extends RuntimeException {

  public SessionNotFoundException() {
    super("Session introuvable");
  }
}
