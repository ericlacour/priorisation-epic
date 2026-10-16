package com.priorisationepic.adapter.in.rest;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.ContractExamples;
import com.priorisationepic.PostgresTestBase;
import com.priorisationepic.adapter.in.ws.SessionFixtures;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Exports de bout en bout contre PostgreSQL (FR-023, FR-024) : CSV tableau, Confluence (wiki et
 * HTML) et JSON, sans jeton, dans l'ordre du tableau et avec un nom de fichier versionné. Le
 * masquage pendant un tour ouvert s'ajoute avec le vote masqué.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "priorisation-epic.allowed-origins=https://front.example",
      "priorisation-epic.tick-interval=10m",
      "priorisation-epic.ping-interval=10m"
    })
class ExportControllerTest extends PostgresTestBase {

  private static final String SESSION = SessionFixtures.SESSION_ID;
  private static final String EXPORTS = "/api/sessions/" + SESSION + "/exports/";

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;

  private final HttpClient http = HttpClient.newHttpClient();
  private final JsonMapper json = new JsonMapper();

  record Response(int status, String contentType, String disposition, byte[] body) {
    String text() {
      return new String(body, StandardCharsets.UTF_8);
    }
  }

  @BeforeEach
  void setUp() {
    SessionFixtures.reset(jdbc);
    SessionFixtures.insertSession(jdbc);
    feature("F-2", "Paiement", null, Map.of("bv", 2, "tc", 2, "rrOe", 2, "js", 3));
    feature("F-1", "Recherche", "Deux\nlignes", Map.of("bv", 8, "tc", 5, "rrOe", 3, "js", 4));
    feature("F-3", "Incomplète", null, Map.of("bv", 6));
  }

  private void feature(
      String externalId, String title, String description, Map<String, Integer> criteria) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "insert into feature (id, session_id, external_id, title, description)"
            + " values (?, ?, ?, ?, ?)",
        id,
        SESSION,
        externalId,
        title,
        description);
    criteria.forEach(
        (key, value) ->
            jdbc.update(
                "insert into feature_criterion_value (feature_id, criterion_key, value)"
                    + " values (?, ?, ?)",
                id,
                key,
                value));
  }

  private Response get(String path) throws Exception {
    HttpResponse<byte[]> response =
        http.send(
            HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET().build(),
            HttpResponse.BodyHandlers.ofByteArray());
    return new Response(
        response.statusCode(),
        response.headers().firstValue("Content-Type").orElse(""),
        response.headers().firstValue("Content-Disposition").orElse(""),
        response.body());
  }

  @Test
  void theCsvBoardIsInBoardOrderWithAVersionedFileName() throws Exception {
    Response response = get(EXPORTS + "csv");

    assertThat(response.status()).isEqualTo(200);
    assertThat(response.contentType()).isEqualTo("text/csv;charset=UTF-8");
    assertThat(response.disposition()).contains("attachment").contains("atelier-tableau-v1.csv");
    assertThat(response.text())
        .isEqualTo(
            "﻿Rang;Identifiant;Titre;Description;BV;TC;RR/OE;JS;CoD;WSJF;À revoir;Motif\r\n"
                + "1;F-1;Recherche;\"Deux\nlignes\";8;5;3;4;16;4,00;;\r\n"
                + "2;F-2;Paiement;;2;2;2;3;6;2,00;;\r\n"
                + ";F-3;Incomplète;;6;;;;;;;\r\n");
  }

  @Test
  void theConfluenceWikiMarkupIsAVersionedTextFile() throws Exception {
    Response response = get(EXPORTS + "confluence-wiki");

    assertThat(response.status()).isEqualTo(200);
    assertThat(response.contentType()).isEqualTo("text/plain;charset=UTF-8");
    assertThat(response.disposition()).contains("atelier-confluence-v1.txt");
    assertThat(response.text())
        .startsWith("h2. Priorisation Fonctionnalités : Atelier (")
        .contains("Format confluence-v1")
        .contains("|1|F-1|Recherche|Deux\\\\lignes|8|5|3|4|16|4,00| | |\n");
  }

  @Test
  void theConfluenceHtmlIsATableFragment() throws Exception {
    Response response = get(EXPORTS + "confluence-html");

    assertThat(response.status()).isEqualTo(200);
    assertThat(response.contentType()).isEqualTo("text/html;charset=UTF-8");
    assertThat(response.disposition()).contains("atelier-confluence-v1.html");
    assertThat(response.text())
        .startsWith("<h2>Priorisation Fonctionnalités : Atelier (")
        .contains("<table>")
        .contains("<td>Deux<br>lignes</td>");
  }

  @Test
  void theJsonExportIsTheWholeSession() throws Exception {
    Response response = get(EXPORTS + "json");

    assertThat(response.status()).isEqualTo(200);
    assertThat(response.contentType()).isEqualTo("application/json");
    assertThat(response.disposition()).contains("atelier-session-v1.json");
    JsonNode root = json.readTree(response.text());
    assertThat(root.get("formatVersion").asInt()).isEqualTo(1);
    assertThat(root.get("session").get("method").asString()).isEqualTo("WSJF");
    assertThat(root.get("features")).hasSize(3);
    assertThat(root.get("features").get(0).get("externalId").asString()).isEqualTo("F-1");
    assertThat(root.get("rounds")).isEmpty();
  }

  @Test
  void noTokenIsNeededAndNothingIsCached() throws Exception {
    HttpResponse<Void> response =
        http.send(
            HttpRequest.newBuilder(URI.create("http://localhost:" + port + EXPORTS + "csv"))
                .GET()
                .build(),
            HttpResponse.BodyHandlers.discarding());

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
  }

  @Test
  void anUnknownFormatIsABadRequest() throws Exception {
    Response response = get(EXPORTS + "pdf");

    assertThat(response.status()).isEqualTo(400);
    assertThat(response.contentType()).startsWith("application/problem+json");
    JsonNode problem = json.readTree(response.text());
    assertThat(problem.get("errors").get(0).get("field").asString()).isEqualTo("format");
  }

  @Test
  void anUnknownSessionIsNotFound() throws Exception {
    String path = "/api/sessions/AAAAAAAAAAAAAAAAAAAAAA/exports/csv";

    Response response = get(path);

    assertThat(response.status()).isEqualTo(404);
    ObjectNode expected =
        (ObjectNode) json.readTree(ContractExamples.read("problem", "session-not-found"));
    expected.put("instance", path);
    assertThat(json.readTree(response.text())).isEqualTo(expected);
  }
}
