package com.priorisationepic.application;

import com.priorisationepic.domain.scale.Scale;
import java.util.List;
import java.util.Map;

/**
 * Lecture d'un fichier importé (FR-007, FR-008, contracts/file-formats.md) : les lignes valides,
 * les lignes rejetées avec leur motif, les avertissements et les colonnes ignorées. Rien n'est
 * écrit avant la confirmation. {@code scale} n'est présent que lorsqu'un export JSON apporte
 * l'échelle à appliquer à une session vide en préparation.
 */
public record ImportPreview(
    SourceType sourceType,
    List<Row> validRows,
    List<Rejected> rejectedRows,
    List<Warning> warnings,
    List<String> ignoredColumns,
    Scale scale) {

  /** Type du fichier importé. */
  public enum SourceType {
    XLSX,
    CSV,
    JSON
  }

  /** Une ligne qui sera importée ; {@code criteria} est rangé par clé de critère. */
  public record Row(
      int line,
      String externalId,
      String title,
      String description,
      Map<String, Integer> criteria) {

    public Row {
      criteria = java.util.Collections.unmodifiableMap(new java.util.LinkedHashMap<>(criteria));
    }
  }

  /** Une ligne rejetée, avec son motif en français. */
  public record Rejected(int line, String externalId, String reason) {}

  /** Un avertissement en français ; {@code line} vaut 0 pour le fichier entier. */
  public record Warning(int line, String message) {}

  public ImportPreview {
    validRows = List.copyOf(validRows);
    rejectedRows = List.copyOf(rejectedRows);
    warnings = List.copyOf(warnings);
    ignoredColumns = List.copyOf(ignoredColumns);
  }
}
