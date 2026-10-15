package com.priorisationepic.adapter.out.io;

import com.priorisationepic.application.ImportContext;
import com.priorisationepic.application.ImportPreview;
import com.priorisationepic.domain.method.ComputedValueDefinition;
import com.priorisationepic.domain.method.CriterionDefinition;
import com.priorisationepic.domain.method.MethodDefinition;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Lecture commune d'un tableau (Excel ou CSV) : la ligne d'en-têtes, puis les lignes de données.
 * Les en-têtes sont comparés sans tenir compte de la casse ni des espaces aux extrémités ; ceux des
 * critères viennent de la définition de la méthode. Les colonnes d'un export du tableau ({@code
 * Rang}, valeurs calculées, {@code À revoir}, {@code Motif}) sont ignorées sans être signalées,
 * pour qu'un export CSV se réimporte ; toute autre colonne inconnue est ignorée et signalée.
 */
final class TabularImport {

  static final String ID = "Identifiant";
  static final String TITLE = "Titre";
  static final String DESCRIPTION = "Description";
  private static final Set<String> EXPORT_COLUMNS = Set.of("rang", "à revoir", "motif");

  private final ImportTexts texts;
  private final MethodDefinition method;
  private final PreviewBuilder builder;
  private Map<Integer, String> columns;

  TabularImport(ImportTexts texts, ImportContext context, ImportPreview.SourceType sourceType) {
    this.texts = texts;
    this.method = context.method().definition();
    this.builder = new PreviewBuilder(texts, context, context.scale(), sourceType);
  }

  /** Les en-têtes attendus, dans l'ordre du modèle. */
  static List<String> expectedHeaders(MethodDefinition method) {
    List<String> headers = new ArrayList<>(List.of(ID, TITLE, DESCRIPTION));
    method.criteria().forEach(c -> headers.add(c.header()));
    return headers;
  }

  /** Vrai une fois la ligne d'en-têtes lue. */
  boolean hasHeader() {
    return columns != null;
  }

  /**
   * La ligne d'en-têtes : chaque colonne reconnue reçoit son rôle ({@code externalId}, {@code
   * title}, {@code description} ou la clé d'un critère). Sans {@code Identifiant} ou {@code Titre},
   * le fichier est refusé en entier.
   */
  void header(int line, List<String> cells) {
    Map<String, String> known = new HashMap<>();
    known.put(normalize(ID), "externalId");
    known.put(normalize(TITLE), "title");
    known.put(normalize(DESCRIPTION), "description");
    for (CriterionDefinition criterion : method.criteria()) {
      known.put(normalize(criterion.header()), criterion.key());
    }
    Set<String> silent = new java.util.HashSet<>(EXPORT_COLUMNS);
    for (ComputedValueDefinition computed : method.computedValues()) {
      silent.add(normalize(computed.header()));
    }
    columns = new LinkedHashMap<>();
    for (int i = 0; i < cells.size(); i++) {
      String cell = cells.get(i) == null ? "" : cells.get(i).strip();
      if (cell.isEmpty()) {
        continue;
      }
      String role = known.get(normalize(cell));
      if (role != null && !columns.containsValue(role)) {
        columns.put(i, role);
      } else if (!silent.contains(normalize(cell))) {
        builder.ignoreColumn(line, cell);
      }
    }
    if (!columns.containsValue("externalId") || !columns.containsValue("title")) {
      throw texts.refused(
          "import.refused.missing-headers", String.join(", ", expectedHeaders(method)));
    }
  }

  /** Une ligne de données ; une ligne entièrement vide est ignorée sans être signalée. */
  void row(int line, List<String> cells) {
    if (cells.stream().allMatch(cell -> cell == null || cell.isBlank())) {
      return;
    }
    Map<String, String> byRole = new HashMap<>();
    columns.forEach(
        (index, role) -> {
          if (index < cells.size()) {
            byRole.put(role, cells.get(index));
          }
        });
    Map<String, String> values = new LinkedHashMap<>();
    for (CriterionDefinition criterion : method.criteria()) {
      values.put(criterion.key(), byRole.get(criterion.key()));
    }
    builder.add(
        new PreviewBuilder.RawRow(
            line,
            byRole.get("externalId"),
            byRole.get("title"),
            byRole.get("description"),
            values));
  }

  /** L'aperçu ; un fichier sans ligne d'en-têtes est vide. */
  ImportPreview build() {
    if (columns == null) {
      throw texts.refused("import.refused.empty");
    }
    return builder.build(null);
  }

  private static String normalize(String header) {
    return header.strip().toLowerCase(Locale.ROOT);
  }
}
