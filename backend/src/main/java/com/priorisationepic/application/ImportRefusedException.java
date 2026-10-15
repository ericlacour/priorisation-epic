package com.priorisationepic.application;

/** Le fichier importé est refusé en entier ; le message, en français, dit quoi corriger. */
public final class ImportRefusedException extends RuntimeException {

  public ImportRefusedException(String message) {
    super(message);
  }
}
