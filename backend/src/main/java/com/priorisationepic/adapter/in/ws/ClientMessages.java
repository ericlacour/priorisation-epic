package com.priorisationepic.adapter.in.ws;

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

  private static final Pattern CRITERION_KEY = Pattern.compile("^[a-z][a-zA-Z0-9]{0,19}$");
  private static final Pattern UUID_FORMAT =
      Pattern.compile(
          "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

  private static final Set<String> SCALE_TYPES = Set.of("CONTINUOUS", "FIBONACCI");
  private static final Set<String> STATUS_ACTIONS = Set.of("START", "CLOSE", "REOPEN");

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

  /** {@code add-feature.json} : {@code criteria} vaut {@code null} si le champ est absent. */
  record AddFeatureMessage(
      String externalId, String title, String description, Map<String, Integer> criteria)
      implements ClientMessage {}

  /**
   * {@code update-feature.json} : un champ absent du message est absent de {@code present}. Une
   * valeur {@code null} dans {@code criteria} efface le critère.
   */
  record UpdateFeatureMessage(
      UUID featureId,
      int version,
      Set<String> present,
      String externalId,
      String title,
      String description,
      Map<String, Integer> criteria,
      Boolean markedForReview,
      String reviewReason)
      implements ClientMessage {}

  /** {@code delete-feature.json} */
  record DeleteFeatureMessage(UUID featureId, int version) implements ClientMessage {}

  /**
   * {@code update-settings.json} : {@code name}, {@code scaleType} et {@code scaleMax} valent
   * {@code null} s'ils sont absents.
   */
  record UpdateSettingsMessage(String name, String scaleType, Integer scaleMax, boolean confirm)
      implements ClientMessage {}

  /** {@code change-status.json} : {@code START}, {@code CLOSE} ou {@code REOPEN}. */
  record ChangeStatusMessage(String action) implements ClientMessage {}

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
      case "updateSettings" -> updateSettings(node);
      case "changeStatus" -> changeStatus(node);
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

  private static ClientMessage addFeature(JsonNode node) {
    if (!onlyFields(node, "type", "externalId", "title", "description", "criteria")
        || !isString(node.get("externalId"), 1, 50)
        || !isString(node.get("title"), 1, 200)
        || !isNullableString(node, "description", 5000)
        || !node.has("externalId")
        || !node.has("title")) {
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
        node.get("externalId").asString(),
        node.get("title").asString(),
        text(node, "description"),
        criteria);
  }

  private static ClientMessage updateFeature(JsonNode node) {
    if (!onlyFields(
            node,
            "type",
            "featureId",
            "version",
            "externalId",
            "title",
            "description",
            "criteria",
            "markedForReview",
            "reviewReason")
        || !isUuid(node.get("featureId"))
        || !isVersion(node.get("version"))
        || (node.has("externalId") && !isString(node.get("externalId"), 1, 50))
        || (node.has("title") && !isString(node.get("title"), 1, 200))
        || !isNullableString(node, "description", 5000)
        || !isNullableString(node, "reviewReason", 200)
        || (node.has("markedForReview") && !node.get("markedForReview").isBoolean())) {
      return new Invalid();
    }
    Map<String, Integer> criteria = null;
    if (node.has("criteria")) {
      criteria = criteria(node.get("criteria"));
      if (criteria == null) {
        return new Invalid();
      }
    }
    Set<String> present = new java.util.HashSet<>();
    node.propertyNames().forEach(present::add);
    return new UpdateFeatureMessage(
        UUID.fromString(node.get("featureId").asString()),
        node.get("version").asInt(),
        present,
        text(node, "externalId"),
        text(node, "title"),
        text(node, "description"),
        criteria,
        node.has("markedForReview") ? node.get("markedForReview").asBoolean() : null,
        text(node, "reviewReason"));
  }

  private static ClientMessage deleteFeature(JsonNode node) {
    if (!onlyFields(node, "type", "featureId", "version")
        || !isUuid(node.get("featureId"))
        || !isVersion(node.get("version"))) {
      return new Invalid();
    }
    return new DeleteFeatureMessage(
        UUID.fromString(node.get("featureId").asString()), node.get("version").asInt());
  }

  private static ClientMessage updateSettings(JsonNode node) {
    if (!onlyFields(node, "type", "name", "scale", "confirm")
        || node.size() < 2
        || (node.has("name") && !isString(node.get("name"), 1, 120))
        || (node.has("confirm") && !node.get("confirm").isBoolean())) {
      return new Invalid();
    }
    String scaleType = null;
    Integer scaleMax = null;
    if (node.has("scale")) {
      JsonNode scale = node.get("scale");
      if (!scale.isObject()
          || scale.size() != 2
          || !scale.path("type").isString()
          || !SCALE_TYPES.contains(scale.get("type").asString())
          || !scale.path("max").isIntegralNumber()
          || !scale.get("max").canConvertToInt()
          || scale.get("max").asInt() < 2
          || scale.get("max").asInt() > 100) {
        return new Invalid();
      }
      scaleType = scale.get("type").asString();
      scaleMax = scale.get("max").asInt();
    }
    return new UpdateSettingsMessage(
        text(node, "name"),
        scaleType,
        scaleMax,
        node.has("confirm") && node.get("confirm").asBoolean());
  }

  private static ClientMessage changeStatus(JsonNode node) {
    if (node.size() != 2
        || !node.path("action").isString()
        || !STATUS_ACTIONS.contains(node.get("action").asString())) {
      return new Invalid();
    }
    return new ChangeStatusMessage(node.get("action").asString());
  }

  /** Valeurs par clé de critère : entiers ≥ 1 ou {@code null}. {@code null} si hors schéma. */
  private static Map<String, Integer> criteria(JsonNode node) {
    if (node == null || !node.isObject()) {
      return null;
    }
    Map<String, Integer> values = new LinkedHashMap<>();
    for (Map.Entry<String, JsonNode> entry : node.properties()) {
      if (!CRITERION_KEY.matcher(entry.getKey()).matches()) {
        return null;
      }
      JsonNode value = entry.getValue();
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

  private static boolean onlyFields(JsonNode node, String... allowed) {
    Set<String> names = Set.of(allowed);
    for (String name : node.propertyNames()) {
      if (!names.contains(name)) {
        return false;
      }
    }
    return true;
  }

  private static String text(JsonNode node, String field) {
    JsonNode value = node.get(field);
    return value == null || value.isNull() ? null : value.asString();
  }

  /** Champ absent, {@code null}, ou texte de 5 000 points de code au plus. */
  private static boolean isNullableString(JsonNode node, String field, int max) {
    JsonNode value = node.get(field);
    return value == null || value.isNull() || isString(value, 0, max);
  }

  private static boolean isUuid(JsonNode value) {
    return value != null && value.isString() && UUID_FORMAT.matcher(value.asString()).matches();
  }

  private static boolean isVersion(JsonNode value) {
    return value != null
        && value.isIntegralNumber()
        && value.canConvertToInt()
        && value.asInt() >= 0;
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
