package com.priorisationepic.application;

import java.util.Arrays;
import java.util.Optional;

/**
 * Les formats d'export (FR-023, FR-024, contracts/file-formats.md), avec leur nom dans l'adresse
 * {@code /api/sessions/{sessionId}/exports/{format}}. Le CSV des votes s'ajoute avec le vote
 * masqué.
 */
public enum ExportFormat {
  CSV("csv"),
  CONFLUENCE_WIKI("confluence-wiki"),
  CONFLUENCE_HTML("confluence-html"),
  JSON("json");

  private final String path;

  ExportFormat(String path) {
    this.path = path;
  }

  /** Le nom du format dans l'adresse. */
  public String path() {
    return path;
  }

  /** Le format de ce nom d'adresse, s'il existe. */
  public static Optional<ExportFormat> fromPath(String path) {
    return Arrays.stream(values()).filter(format -> format.path.equals(path)).findFirst();
  }
}
