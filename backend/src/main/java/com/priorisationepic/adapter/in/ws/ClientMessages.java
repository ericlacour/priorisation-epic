package com.priorisationepic.adapter.in.ws;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
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
  private static final Set<String> RANKING_OUTCOMES = Set.of("SAVED", "CANCELLED");
  private static final Set<String> OPINIONS = Set.of("AGREE", "RAISE", "LOWER");

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

  /** {@code ranking-draft.json}, lu sans les règles métier (laissées au domaine). */
  record RankingDraftMessage(
      List<String> criterionKeys,
      String criterionKey,
      List<List<UUID>> levels,
      List<UUID> unranked,
      Map<UUID, Integer> values) {}

  /** {@code update-ranking-draft.json} : {@code draft} vaut {@code null} hors diffusion. */
  record UpdateRankingDraftMessage(boolean live, RankingDraftMessage draft)
      implements ClientMessage {}

  /** {@code end-ranking.json} : {@code SAVED} ou {@code CANCELLED}. */
  record EndRankingMessage(String outcome) implements ClientMessage {}

  /**
   * {@code give-opinion.json} : {@code opinion} nul retire l'avis ; {@code comment} nul (absent)
   * garde le commentaire précédent, vide l'efface.
   */
  record GiveOpinionMessage(UUID featureId, String criterionKey, String opinion, String comment)
      implements ClientMessage {}

  /** {@code clear-opinions.json} */
  record ClearOpinionsMessage(UUID featureId, String criterionKey) implements ClientMessage {}

  /** {@code set-spotlight.json} : {@code featureId} nul termine la discussion. */
  record SetSpotlightMessage(UUID featureId) implements ClientMessage {}

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
      case "updateRankingDraft" -> updateRankingDraft(node);
      case "endRanking" -> endRanking(node);
      case "giveOpinion" -> giveOpinion(node);
      case "clearOpinions" -> clearOpinions(node);
      case "setSpotlight" -> setSpotlight(node);
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

  private static ClientMessage updateRankingDraft(JsonNode node) {
    if (!onlyFields(node, "type", "live", "draft") || !node.path("live").isBoolean()) {
      return new Invalid();
    }
    boolean live = node.get("live").asBoolean();
    RankingDraftMessage draft = null;
    if (node.has("draft")) {
      draft = rankingDraft(node.get("draft"));
      if (draft == null) {
        return new Invalid();
      }
    } else if (live) {
      return new Invalid();
    }
    return new UpdateRankingDraftMessage(live, live ? draft : null);
  }

  /** Brouillon conforme au schéma, ou {@code null}. */
  private static RankingDraftMessage rankingDraft(JsonNode node) {
    if (node == null
        || !node.isObject()
        || node.size() != 5
        || !onlyFields(node, "criterionKeys", "criterionKey", "levels", "unranked", "values")
        || !isCriterionKey(node.get("criterionKey"))
        || !node.path("criterionKeys").isArray()
        || node.get("criterionKeys").isEmpty()
        || !node.path("levels").isArray()
        || !node.path("values").isObject()) {
      return null;
    }
    List<String> criterionKeys = new ArrayList<>();
    for (JsonNode key : node.get("criterionKeys")) {
      if (!isCriterionKey(key)) {
        return null;
      }
      criterionKeys.add(key.asString());
    }
    if (new HashSet<>(criterionKeys).size() != criterionKeys.size()) {
      return null;
    }
    List<List<UUID>> levels = new ArrayList<>();
    for (JsonNode level : node.get("levels")) {
      List<UUID> ids = uuids(level);
      if (ids == null || ids.isEmpty()) {
        return null;
      }
      levels.add(ids);
    }
    List<UUID> unranked = uuids(node.get("unranked"));
    if (unranked == null) {
      return null;
    }
    Map<UUID, Integer> values = new LinkedHashMap<>();
    for (Map.Entry<String, JsonNode> entry : node.get("values").properties()) {
      JsonNode value = entry.getValue();
      if (!UUID_FORMAT.matcher(entry.getKey()).matches()) {
        return null;
      }
      if (value.isNull()) {
        values.put(UUID.fromString(entry.getKey()), null);
      } else if (value.isIntegralNumber() && value.canConvertToInt() && value.asInt() >= 1) {
        values.put(UUID.fromString(entry.getKey()), value.asInt());
      } else {
        return null;
      }
    }
    return new RankingDraftMessage(
        criterionKeys, node.get("criterionKey").asString(), levels, unranked, values);
  }

  private static ClientMessage endRanking(JsonNode node) {
    if (node.size() != 2
        || !node.path("outcome").isString()
        || !RANKING_OUTCOMES.contains(node.get("outcome").asString())) {
      return new Invalid();
    }
    return new EndRankingMessage(node.get("outcome").asString());
  }

  private static ClientMessage giveOpinion(JsonNode node) {
    if (!onlyFields(node, "type", "featureId", "criterionKey", "opinion", "comment")
        || !isUuid(node.get("featureId"))
        || !isCriterionKey(node.get("criterionKey"))
        || !node.has("opinion")
        || !(node.get("opinion").isNull()
            || (node.get("opinion").isString()
                && OPINIONS.contains(node.get("opinion").asString())))
        || (node.has("comment") && !isString(node.get("comment"), 0, 140))) {
      return new Invalid();
    }
    return new GiveOpinionMessage(
        UUID.fromString(node.get("featureId").asString()),
        node.get("criterionKey").asString(),
        text(node, "opinion"),
        text(node, "comment"));
  }

  private static ClientMessage clearOpinions(JsonNode node) {
    if (node.size() != 3
        || !isUuid(node.get("featureId"))
        || !isCriterionKey(node.get("criterionKey"))) {
      return new Invalid();
    }
    return new ClearOpinionsMessage(
        UUID.fromString(node.get("featureId").asString()), node.get("criterionKey").asString());
  }

  private static ClientMessage setSpotlight(JsonNode node) {
    JsonNode featureId = node.get("featureId");
    if (node.size() != 2 || featureId == null || !(featureId.isNull() || isUuid(featureId))) {
      return new Invalid();
    }
    return new SetSpotlightMessage(
        featureId.isNull() ? null : UUID.fromString(featureId.asString()));
  }

  /** Un tableau d'identifiants, ou {@code null} s'il est hors schéma. */
  private static List<UUID> uuids(JsonNode node) {
    if (node == null || !node.isArray()) {
      return null;
    }
    List<UUID> ids = new ArrayList<>();
    for (JsonNode id : node) {
      if (!isUuid(id)) {
        return null;
      }
      ids.add(UUID.fromString(id.asString()));
    }
    return ids;
  }

  private static boolean isCriterionKey(JsonNode value) {
    return value != null && value.isString() && CRITERION_KEY.matcher(value.asString()).matches();
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
