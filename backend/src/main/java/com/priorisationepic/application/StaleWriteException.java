package com.priorisationepic.application;

/**
 * Une écriture visait une version qui n'est plus la version enregistrée : quelqu'un d'autre a
 * modifié la ligne entre-temps. Garde de dernier recours sous le verrou de session, qui évite déjà
 * ce cas dans une seule instance.
 */
public final class StaleWriteException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  public StaleWriteException() {
    super("La version enregistrée a changé");
  }
}
