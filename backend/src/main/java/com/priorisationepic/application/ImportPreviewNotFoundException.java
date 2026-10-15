package com.priorisationepic.application;

/** Aperçu d'import inconnu, expiré ou déjà confirmé (REST : 404). */
public final class ImportPreviewNotFoundException extends RuntimeException {

  public ImportPreviewNotFoundException() {
    super("import preview not found");
  }
}
