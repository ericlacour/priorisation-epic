package com.priorisationepic.adapter.in.ws;

import com.priorisationepic.application.Change;
import com.priorisationepic.application.FeatureUseCase;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Lecture stricte des messages client → serveur (asyncapi.yaml) : tout ce qui sort du schéma (champ
 * en plus ou en moins, type de valeur, bornes de longueur comptées en points de code comme JSON
 * Schema) est {@link Invalid}.
 */
final class ClientMessages {

  static final int TOKEN_MAX_LENGTH = 64;

  private ClientMessages() {}

  sealed interface ClientMessage {}

  /** {@code hello.json} : {@code animationToken} est facultatif. */
  record HelloMessage(String participantToken, String animationToken) implements ClientMessage {
    /** Jamais un jeton dans un journal. */
    @Override
    public String toString() {
      return "HelloMessage[***]";
    }
  }

  /** {@code heartbeat.json} */
  record HeartbeatMessage() implements ClientMessage {}

  /** {@code add-feature.json} */
  record AddFeatureMessage(FeatureUseCase.Add command) implements ClientMessage {}

  /** {@code update-feature.json} */
  record UpdateFeatureMessage(FeatureUseCase.Update command) implements ClientMessage {}

  /** {@code delete-feature.json} */
  record DeleteFeatureMessage(FeatureUseCase.Delete command) implements ClientMessage {}

  /** JSON invalide, {@code type} inconnu ou message hors schéma. */
  record Invalid() implements ClientMessage {}

  static ClientMessage parse(JsonMapper jsonMapper, String payload) {
    JsonNode node;
    try {
      node = jsonMapper.readTree(payload);
    } catch (JacksonException e) {
      return new Invalid();
    }
    if (node == null || !node.isObject() || !node.path("type").isString()) {
      return new Invalid();
    }
    return switch (node.get("type").asString()) {
      case "hello" -> hello(node);
      case "heartbeat" -> node.size() == 1 ? new HeartbeatMessage() : new Invalid();
      case "addFeature" -> addFeature(node);
      case "updateFeature" -> updateFeature(node);
      case "deleteFeature" -> deleteFeature(node);
      default -> new Invalid();
    };
  }

  private static ClientMessage hello(JsonNode node) {
    boolean withAnimation = node.has("animationToken");
    int expectedFields = withAnimation ? 3 : 2;
    if (node.size() != expectedFields
        || !isString(node.get("participantToken"), 1, TOKEN_MAX_LENGTH)
        || (withAnimation && !isString(node.get("animationToken"), 1, TOKEN_MAX_LENGTH))) {
      return new Invalid();
    }
    return new HelloMessage(
        node.get("participantToken").asString(),
        withAnimation ? node.get("animationToken").asString() : null);
  }

  private static final Set<String> ADD_FIELDS =
      Set.of("type", "externalId", "title", "description", "criteria");
  private static final Set<String> UPDATE_FIELDS =
      Set.of(
          "type",
          "featureId",
          "version",
          "externalId",
          "title",
          "description",
          "criteria",
          "markedForReview",
          "reviewReason");
  private static final Set<String> DELETE_FIELDS = Set.of("type", "featureId", "version");
  private static final Pattern CRITERION_KEY = Pattern.compile("^[a-z][a-zA-Z0-9]{0,19}$");

  private static ClientMessage addFeature(JsonNode node) {
    if (!onlyFields(node, ADD_FIELDS)
        || !isString(node.get("externalId"), 1, 50)
        || !isString(node.get("title"), 1, 200)
        || !isOptionalText(node, "description", 5000)) {
      return new Invalid();
    }
    Map<String, Integer> criteria = null;
    if (node.has("criteria")) {
      criteria = criteria(node.get("criteria"));
      if (criteria == null) {
        return new Invalid();
      }
    }
    return new AddFeatureMessage(
        new FeatureUseCase.Add(
            node.get("externalId").asString(),
            node.get("title").asString(),
            node.has("description") && !node.get("description").isNull()
                ? node.get("description").asString()
                : null,
            criteria));
  }

  private static ClientMessage updateFeature(JsonNode node) {
    UUID featureId = featureId(node);
    if (!onlyFields(node, UPDATE_FIELDS)
        || featureId == null
        || !isVersion(node.get("version"))
        || (node.has("externalId") && !isString(node.get("externalId"), 1, 50))
        || (node.has("title") && !isString(node.get("title"), 1, 200))
        || !isOptionalText(node, "description", 5000)
        || !isOptionalText(node, "reviewReason", 200)
        || (node.has("markedForReview") && !node.get("markedForReview").isBoolean())) {
      return new Invalid();
    }
    Change<Map<String, Integer>> criteria = Change.absent();
    if (node.has("criteria")) {
      Map<String, Integer> parsed = criteria(node.get("criteria"));
      if (parsed == null) {
        return new Invalid();
      }
      criteria = Change.set(parsed);
    }
    return new UpdateFeatureMessage(
        new FeatureUseCase.Update(
            featureId,
            node.get("version").asLong(),
            text(node, "externalId"),
            text(node, "title"),
            text(node, "description"),
            criteria,
            node.has("markedForReview")
                ? Change.set(node.get("markedForReview").asBoolean())
                : Change.absent(),
            text(node, "reviewReason")));
  }

  private static ClientMessage deleteFeature(JsonNode node) {
    UUID featureId = featureId(node);
    if (!onlyFields(node, DELETE_FIELDS) || featureId == null || !isVersion(node.get("version"))) {
      return new Invalid();
    }
    return new DeleteFeatureMessage(
        new FeatureUseCase.Delete(featureId, node.get("version").asLong()));
  }

  /** Un champ texte facultatif : absent, ou présent (éventuellement nul). */
  private static Change<String> text(JsonNode node, String field) {
    if (!node.has(field)) {
      return Change.absent();
    }
    return Change.set(node.get(field).isNull() ? null : node.get(field).asString());
  }

  private static boolean onlyFields(JsonNode node, Set<String> allowed) {
    for (String name : node.propertyNames()) {
      if (!allowed.contains(name)) {
        return false;
      }
    }
    return true;
  }

  private static boolean isOptionalText(JsonNode node, String field, int max) {
    if (!node.has(field) || node.get(field).isNull()) {
      return true;
    }
    return isString(node.get(field), 0, max);
  }

  private static boolean isVersion(JsonNode value) {
    return value != null
        && value.isIntegralNumber()
        && value.canConvertToLong()
        && value.asLong() >= 0;
  }

  private static UUID featureId(JsonNode node) {
    JsonNode value = node.get("featureId");
    if (value == null || !value.isString()) {
      return null;
    }
    try {
      return UUID.fromString(value.asString());
    } catch (IllegalArgumentException e) {
      return null;
    }
  }

  /** Les valeurs par clé de critère ; {@code null} si hors schéma ({@code criteria.json}). */
  private static Map<String, Integer> criteria(JsonNode node) {
    if (node == null || !node.isObject()) {
      return null;
    }
    Map<String, Integer> values = new LinkedHashMap<>();
    for (Map.Entry<String, JsonNode> entry : node.properties()) {
      JsonNode value = entry.getValue();
      if (!CRITERION_KEY.matcher(entry.getKey()).matches()) {
        return null;
      }
      if (value.isNull()) {
        values.put(entry.getKey(), null);
      } else if (value.isIntegralNumber() && value.canConvertToInt() && value.asInt() >= 1) {
        values.put(entry.getKey(), value.asInt());
      } else {
        return null;
      }
    }
    return values;
  }

  private static boolean isString(JsonNode value, int min, int max) {
    if (value == null || !value.isString()) {
      return false;
    }
    String text = value.asString();
    int length = text.codePointCount(0, text.length());
    return length >= min && length <= max;
  }
}
