package com.priorisationepic.adapter.out.io;

import com.priorisationepic.application.ImportContext;
import com.priorisationepic.application.ImportPreview;
import com.priorisationepic.application.ImportPreview.Rejected;
import com.priorisationepic.application.ImportPreview.Row;
import com.priorisationepic.application.ImportPreview.Warning;
import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.method.CriterionDefinition;
import com.priorisationepic.domain.method.MethodDefinition;
import com.priorisationepic.domain.scale.Scale;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Règles d'import communes aux trois formats (contracts/file-formats.md) : une ligne est rejetée
 * pour un identifiant vide, déjà utilisé (dans la session ou plus haut dans le fichier) ou trop
 * long, ou pour un titre vide ou trop long ; une valeur de critère qui n'est pas un entier de
 * l'échelle est seulement ignorée, avec un avertissement.
 */
final class PreviewBuilder {

  /** Plafond de lignes de données d'un fichier. */
  static final int MAX_ROWS = 1000;

  /** Plafond de taille d'un fichier : 5 Mo. */
  static final int MAX_BYTES = 5 * 1024 * 1024;

  private static final Pattern INTEGER = Pattern.compile("^[+-]?\\d{1,9}$");

  private final ImportTexts texts;
  private final ImportContext context;
  private final MethodDefinition method;
  private final Scale scale;
  private final ImportPreview.SourceType sourceType;
  private final List<Row> valid = new ArrayList<>();
  private final List<Rejected> rejected = new ArrayList<>();
  private final List<Warning> warnings = new ArrayList<>();
  private final List<String> ignoredColumns = new ArrayList<>();
  private final Set<String> seen = new HashSet<>();
  private int rows;

  /**
   * @param scale l'échelle contre laquelle les valeurs sont contrôlées : celle de la session, ou
   *     celle d'un export JSON qui la remplacera
   */
  PreviewBuilder(
      ImportTexts texts, ImportContext context, Scale scale, ImportPreview.SourceType sourceType) {
    this.texts = texts;
    this.context = context;
    this.method = context.method().definition();
    this.scale = scale;
    this.sourceType = sourceType;
  }

  /** Refuse un fichier de plus de 5 Mo. */
  static void requireSize(byte[] content, ImportTexts texts) {
    if (content.length > MAX_BYTES) {
      throw texts.refused("import.refused.too-large");
    }
  }

  /** Une ligne de données lue ; les valeurs de critère sont rangées par clé, en texte brut. */
  record RawRow(
      int line, String externalId, String title, String description, Map<String, String> values) {}

  /** Ajoute une ligne : elle compte dans le plafond des 1 000 lignes, puis elle est contrôlée. */
  void add(RawRow raw) {
    if (++rows > MAX_ROWS) {
      throw texts.refused("import.refused.too-many-rows");
    }
    String externalId = trim(raw.externalId());
    String title = trim(raw.title());
    String description =
        raw.description() == null || raw.description().isBlank() ? null : raw.description().strip();
    String reason = rejection(externalId, title, description);
    if (reason != null) {
      rejected.add(new Rejected(raw.line(), externalId, reason));
      return;
    }
    seen.add(externalId.toLowerCase(Locale.ROOT));
    Map<String, Integer> criteria = new LinkedHashMap<>();
    for (CriterionDefinition criterion : method.criteria()) {
      String value = trim(raw.values().get(criterion.key()));
      if (value == null) {
        continue;
      }
      if (!INTEGER.matcher(value).matches()) {
        warn(raw.line(), "import.warning.not-integer", criterion.header(), value);
      } else if (!scale.accepts(Integer.parseInt(value))) {
        warn(
            raw.line(),
            "import.warning.out-of-scale",
            criterion.header(),
            String.valueOf(Integer.parseInt(value)));
      } else {
        criteria.put(criterion.key(), Integer.parseInt(value));
      }
    }
    valid.add(new Row(raw.line(), externalId, title, description, criteria));
  }

  private String rejection(String externalId, String title, String description) {
    if (externalId == null) {
      return texts.text("import.rejected.id-empty");
    }
    if (title == null) {
      return texts.text("import.rejected.title-empty");
    }
    if (length(externalId) > Feature.EXTERNAL_ID_MAX_LENGTH) {
      return texts.text("import.rejected.id-too-long");
    }
    if (length(title) > Feature.TITLE_MAX_LENGTH) {
      return texts.text("import.rejected.title-too-long");
    }
    if (description != null && length(description) > Feature.DESCRIPTION_MAX_LENGTH) {
      return texts.text("import.rejected.description-too-long");
    }
    if (context.isTaken(externalId) || seen.contains(externalId.toLowerCase(Locale.ROOT))) {
      return texts.text("import.rejected.id-taken");
    }
    return null;
  }

  /** Une colonne inconnue, ignorée et signalée. */
  void ignoreColumn(int line, String header) {
    ignoredColumns.add(header);
    warn(line, "import.warning.unknown-column", header);
  }

  void warn(int line, String key, String... args) {
    warnings.add(new Warning(line, texts.text(key, args)));
  }

  /** Les lignes valides lues jusqu'ici. */
  List<Row> validRows() {
    return valid;
  }

  ImportPreview build(Scale scaleToApply) {
    return new ImportPreview(sourceType, valid, rejected, warnings, ignoredColumns, scaleToApply);
  }

  private static String trim(String text) {
    if (text == null) {
      return null;
    }
    String stripped = text.strip();
    return stripped.isEmpty() ? null : stripped;
  }

  private static int length(String text) {
    return text.codePointCount(0, text.length());
  }
}
