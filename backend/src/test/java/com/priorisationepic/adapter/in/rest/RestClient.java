package com.priorisationepic.adapter.in.rest;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Client HTTP de test contre l'application démarrée sur un port aléatoire. */
final class RestClient {

  /** Réponse HTTP avec son corps JSON. */
  record Response(int status, String contentType, String body) {
    JsonNode json() {
      return new JsonMapper().readTree(body);
    }
  }

  private final HttpClient http = HttpClient.newHttpClient();
  private final String base;

  RestClient(int port) {
    this.base = "http://localhost:" + port;
  }

  Response get(String path) throws Exception {
    return send(HttpRequest.newBuilder(URI.create(base + path)).GET().build());
  }

  Response post(String path, String json) throws Exception {
    return send(
        HttpRequest.newBuilder(URI.create(base + path))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8))
            .build());
  }

  private Response send(HttpRequest request) throws Exception {
    HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
    return new Response(
        response.statusCode(),
        response.headers().firstValue("Content-Type").orElse(""),
        response.body());
  }
}
