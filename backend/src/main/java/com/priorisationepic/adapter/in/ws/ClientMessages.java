package com.priorisationepic.adapter.in.ws;

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

  private static boolean isString(JsonNode value, int min, int max) {
    if (value == null || !value.isString()) {
      return false;
    }
    String text = value.asString();
    int length = text.codePointCount(0, text.length());
    return length >= min && length <= max;
  }
}
