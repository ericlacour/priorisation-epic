package com.priorisationepic.adapter.out.io;

import com.priorisationepic.application.ImportContext;
import com.priorisationepic.application.ImportPreview;
import com.priorisationepic.domain.method.ComputedValueDefinition;
import com.priorisationepic.domain.method.Criteria;
import com.priorisationepic.domain.method.Fraction;
import com.priorisationepic.domain.method.MethodDefinition;
import com.priorisationepic.domain.method.PrioritizationMethod;
import com.priorisationepic.domain.method.Ranking;
import com.priorisationepic.domain.method.Score;
import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.domain.scale.ScaleType;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Import d'un export JSON de l'outil ({@code formatVersion} 1, contracts/file-formats.md). Seules
 * les fonctionnalités sont importées : les tours et les votes ne le sont jamais (constitution VI).
 * Un fichier produit avec une autre méthode, ou une autre version, est refusé en entier. Les
 * valeurs calculées et le rang du fichier sont recalculés ; un écart donne un avertissement. Si la
 * session est en préparation et vide, l'échelle du fichier est appliquée.
 */
@Component
public class JsonSessionReader {

  static final int FORMAT_VERSION = 1;

  private final ImportTexts texts;
  private final JsonMapper json;

  public JsonSessionReader(ImportTexts texts, JsonMapper json) {
    this.texts = texts;
    this.json = json;
  }

  public ImportPreview read(byte[] content, ImportContext context) {
    PreviewBuilder.requireSize(content, texts);
    JsonNode root = parse(content);
    if (!root.path("formatVersion").isIntegralNumber()
        || !root.path("session").isObject()
        || !root.path("features").isArray()) {
      throw texts.refused("import.refused.unreadable-json");
    }
    if (root.get("formatVersion").asInt() != FORMAT_VERSION) {
      throw texts.refused("import.refused.format-version", root.get("formatVersion").toString());
    }
    PrioritizationMethod method = context.method();
    MethodDefinition definition = method.definition();
    JsonNode session = root.get("session");
    String fileMethod = session.path("method").asString("?");
    int fileVersion = session.path("methodVersion").asInt(0);
    if (!fileMethod.equals(definition.key()) || fileVersion != definition.version()) {
      throw texts.refused(
          "import.refused.other-method",
          fileMethod + " v" + fileVersion,
          definition.key() + " v" + definition.version());
    }
    Scale scale = context.scale();
    Scale scaleToApply = null;
    if (context.scaleReplaceable() && session.has("scale")) {
      Scale fileScale = scale(session.get("scale"));
      if (!fileScale.equals(context.scale())) {
        scale = fileScale;
        scaleToApply = fileScale;
      }
    }

    PreviewBuilder builder =
        new PreviewBuilder(texts, context, scale, ImportPreview.SourceType.JSON);
    List<JsonNode> features = new ArrayList<>();
    root.get("features").forEach(features::add);
    for (int i = 0; i < features.size(); i++) {
      builder.add(row(i + 1, features.get(i), definition, builder));
    }
    checkComputed(builder, features, method, scale);
    if (root.path("rounds").isArray() && !root.get("rounds").isEmpty()) {
      builder.warn(0, "import.warning.rounds-ignored");
    }
    return builder.build(scaleToApply);
  }

  private JsonNode parse(byte[] content) {
    int offset =
        content.length >= 3
                && content[0] == (byte) 0xEF
                && content[1] == (byte) 0xBB
                && content[2] == (byte) 0xBF
            ? 3
            : 0;
    try {
      JsonNode root =
          json.readTree(
              new String(content, offset, content.length - offset, StandardCharsets.UTF_8));
      if (root == null || !root.isObject()) {
        throw texts.refused("import.refused.unreadable-json");
      }
      return root;
    } catch (JacksonException e) {
      throw texts.refused("import.refused.unreadable-json");
    }
  }

  private Scale scale(JsonNode node) {
    try {
      return new Scale(
          ScaleType.valueOf(node.path("type").asString("")), node.path("max").asInt(0));
    } catch (IllegalArgumentException e) {
      throw texts.refused("import.refused.invalid-scale");
    }
  }

  private static PreviewBuilder.RawRow row(
      int line, JsonNode feature, MethodDefinition definition, PreviewBuilder builder) {
    Map<String, String> values = new LinkedHashMap<>();
    JsonNode criteria = feature.path("criteria");
    if (criteria.isObject()) {
      for (Map.Entry<String, JsonNode> entry : criteria.properties()) {
        if (!definition.hasCriterion(entry.getKey())) {
          builder.warn(line, "import.warning.unknown-criterion", entry.getKey());
        } else if (!entry.getValue().isNull()) {
          values.put(entry.getKey(), scalar(entry.getValue()));
        }
      }
    }
    return new PreviewBuilder.RawRow(
        line,
        scalar(feature.get("externalId")),
        scalar(feature.get("title")),
        scalar(feature.get("description")),
        values);
  }

  /** Le texte d'une valeur simple ; {@code null} pour une valeur absente, nulle ou composée. */
  private static String scalar(JsonNode node) {
    if (node == null || node.isNull() || node.isContainer()) {
      return null;
    }
    return node.isString() ? node.asString() : node.toString();
  }

  /**
   * Recalcule les valeurs et le rang des lignes valides, et signale chaque écart avec le fichier.
   */
  private void checkComputed(
      PreviewBuilder builder, List<JsonNode> features, PrioritizationMethod method, Scale scale) {
    MethodDefinition definition = method.definition();
    Map<ImportPreview.Row, Score> scores = new LinkedHashMap<>();
    for (ImportPreview.Row row : builder.validRows()) {
      scores.put(row, Score.of(method, Criteria.of(definition, row.criteria()), scale));
    }
    List<ImportPreview.Row> complete =
        scores.keySet().stream().filter(row -> scores.get(row).complete()).toList();
    Map<ImportPreview.Row, Integer> ranks = new LinkedHashMap<>();
    Ranking.rank(method, complete, ImportPreview.Row::externalId, scores::get)
        .forEach(ranked -> ranks.put(ranked.item(), ranked.rank()));
    for (ImportPreview.Row row : complete) {
      JsonNode feature = features.get(row.line() - 1);
      JsonNode computed = feature.path("computed");
      for (ComputedValueDefinition value : definition.computedValues()) {
        JsonNode inFile = computed.get(value.key());
        Fraction fraction = scores.get(row).computed().get(value.key());
        String recalculated = fraction.display(value.display());
        if (inFile != null && !inFile.isNull() && !recalculated.equals(scalar(inFile))) {
          builder.warn(
              row.line(),
              "import.warning.computed-mismatch",
              value.code(),
              recalculated,
              scalar(inFile));
        }
      }
      JsonNode rank = feature.get("rank");
      if (rank != null && rank.isIntegralNumber() && rank.asInt() != ranks.get(row)) {
        builder.warn(
            row.line(),
            "import.warning.rank-mismatch",
            String.valueOf(ranks.get(row)),
            String.valueOf(rank.asInt()));
      }
    }
  }
}
