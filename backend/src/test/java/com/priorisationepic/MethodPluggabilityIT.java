package com.priorisationepic;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.adapter.in.ws.SessionFixtures;
import com.priorisationepic.adapter.in.ws.WsTestClient;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.method.WsjfMethod;
import com.priorisationepic.testmethod.FakeTwoCriteriaMethod;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Généricité de bout en bout (SC-009, FR-017a, FR-017b) : la méthode fictive {@link
 * FakeTwoCriteriaMethod}, enregistrée par la configuration de ce test seulement, traverse toute
 * l'application sans autre code : saisie directe, tri, import CSV et JSON, exports CSV, Confluence
 * et JSON, et un {@code sessionState} conforme au contrat. Aucune classe hors de {@code
 * domain/method/} ne nomme un critère ou une valeur calculée du WSJF. Le vote, la révélation et le
 * consensus s'ajoutent avec le vote masqué.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "priorisation-epic.allowed-origins=https://front.example",
      "priorisation-epic.tick-interval=10m",
      "priorisation-epic.ping-interval=10m"
    })
@Import(MethodPluggabilityIT.TestMethods.class)
class MethodPluggabilityIT extends PostgresTestBase {

  /** Le registre de production, plus la méthode fictive. */
  @TestConfiguration
  static class TestMethods {
    @Bean
    @Primary
    MethodRegistry testMethodRegistry() {
      return new MethodRegistry(
          List.of(WsjfMethod.version1(), WsjfMethod.version2(), new FakeTwoCriteriaMethod()));
    }
  }

  private static final Pattern WSJF_KEYS =
      Pattern.compile("(?<![\\p{L}\\p{N}_])(bv|tc|rrOe|js|cod|wsjf)(?![\\p{L}\\p{N}_])");

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;

  private final HttpClient http = HttpClient.newHttpClient();
  private final JsonMapper json = new JsonMapper();
  private final List<WsTestClient> sockets = new ArrayList<>();

  private record Created(String sessionId, String participantToken, String animationToken) {}

  private record Response(int status, String text) {
    JsonNode json() {
      return new JsonMapper().readTree(text);
    }
  }

  @BeforeEach
  void setUp() {
    SessionFixtures.reset(jdbc);
  }

  @AfterEach
  void close() {
    sockets.forEach(WsTestClient::abort);
  }

  @Test
  void aSessionWithAnotherMethodWorksFromEntryToExportsAndBack() throws Exception {
    Created session = create("Généricité");
    WsTestClient facilitator = WsTestClient.open(http, port, session.sessionId(), false);
    sockets.add(facilitator);
    facilitator.hello(session.participantToken(), session.animationToken());
    String first = facilitator.nextContaining("\"type\":\"sessionState\"", 5_000);
    assertThat(ContractSchemas.validate("session-state", first)).isEmpty();
    assertThat(json.readTree(first).get("methodDefinition").get("key").asString())
        .isEqualTo(FakeTwoCriteriaMethod.KEY);

    // Saisie directe et tri : ratio décroissant, l'incomplète en dernier.
    facilitator.send(addFeature("R-1", "Un", "{\"reach\":8,\"effort\":2}"));
    facilitator.send(addFeature("R-2", "Deux", "{\"reach\":9,\"effort\":1}"));
    facilitator.send(addFeature("R-3", "Trois", "{\"reach\":3}"));
    String state = facilitator.nextContaining("\"R-3\"", 5_000);
    assertThat(state).isNotNull();
    assertThat(ContractSchemas.validate("session-state", state)).isEmpty();
    assertThat(ids(json.readTree(state))).containsExactly("R-2", "R-1", "R-3");
    assertThat(
            json.readTree(state)
                .get("features")
                .get(0)
                .get("score")
                .get("computed")
                .get("ratio")
                .get("display")
                .asString())
        .isEqualTo("9,00");

    // Import CSV : les colonnes viennent de la méthode, BV est inconnue.
    Response preview =
        upload(
            session,
            "a.csv",
            "Identifiant;Titre;Reach;Effort;BV\nR-4;Quatre;6;3;8\n"
                .getBytes(StandardCharsets.UTF_8));
    assertThat(preview.status()).isEqualTo(200);
    assertThat(preview.json().get("ignoredColumns").toString()).contains("BV");
    assertThat(confirm(session, preview.json().get("previewId").asString()).status())
        .isEqualTo(200);
    assertThat(ids(get("/api/sessions/" + session.sessionId()).json()))
        .containsExactly("R-2", "R-1", "R-4", "R-3");

    // Exports.
    String exports = "/api/sessions/" + session.sessionId() + "/exports/";
    assertThat(get(exports + "csv").text())
        .isEqualTo(
            "﻿Rang;Identifiant;Titre;Description;Reach;Effort;Ratio;À revoir;Motif\r\n"
                + "1;R-2;Deux;;9;1;9,00;;\r\n"
                + "2;R-1;Un;;8;2;4,00;;\r\n"
                + "3;R-4;Quatre;;6;3;2,00;;\r\n"
                + ";R-3;Trois;;3;;;;\r\n");
    assertThat(get(exports + "confluence-wiki").text())
        .contains("Méthode Reach / Effort v1. Formule : Ratio = Reach / Effort.")
        .contains(
            "||Rang||Identifiant||Titre||Description||Reach||Effort||Ratio||À revoir||Motif||")
        .contains("|1|R-2|Deux| |9|1|9,00| | |");
    assertThat(get(exports + "confluence-html").text())
        .contains("<th>Reach</th><th>Effort</th><th>Ratio</th>");
    Response exported = get(exports + "json");
    JsonNode export = exported.json();
    assertThat(export.get("session").get("method").asString()).isEqualTo("REACH");
    assertThat(export.get("features").get(0).get("criteria").toString())
        .isEqualTo("{\"reach\":9,\"effort\":1}");
    assertThat(export.get("features").get(0).get("computed").toString())
        .isEqualTo("{\"ratio\":\"9,00\"}");

    // Import JSON dans une session vide de la même méthode : même tableau.
    Created copy = create("Copie");
    Response jsonPreview =
        upload(copy, "export.json", exported.text().getBytes(StandardCharsets.UTF_8));
    assertThat(jsonPreview.status()).isEqualTo(200);
    assertThat(jsonPreview.json().get("warnings")).isEmpty();
    confirm(copy, jsonPreview.json().get("previewId").asString());
    Response copied = get("/api/sessions/" + copy.sessionId());
    assertThat(ContractSchemas.validate("session-state", copied.text())).isEmpty();
    assertThat(ids(copied.json())).containsExactly("R-2", "R-1", "R-4", "R-3");
    assertThat(scores(copied.json()))
        .isEqualTo(scores(get("/api/sessions/" + session.sessionId()).json()));
  }

  @Test
  void noClassOutsideTheMethodPackageNamesAWsjfKey() throws IOException {
    Path sources = Path.of("src", "main", "java");
    Path methods = sources.resolve(Path.of("com", "priorisationepic", "domain", "method"));
    List<String> offenders = new ArrayList<>();
    try (Stream<Path> files = Files.walk(sources)) {
      for (Path file : files.filter(f -> f.toString().endsWith(".java")).toList()) {
        if (file.startsWith(methods)) {
          continue;
        }
        String code = withoutComments(Files.readString(file));
        Matcher matcher = WSJF_KEYS.matcher(code);
        while (matcher.find()) {
          offenders.add(sources.relativize(file) + " : " + matcher.group());
        }
      }
    }
    assertThat(offenders).isEmpty();
  }

  @Test
  void theSourceScanSpotsAWsjfKey() {
    assertThat(WSJF_KEYS.matcher(withoutComments("int x = criteria.get(\"rrOe\");")).find())
        .isTrue();
    assertThat(WSJF_KEYS.matcher(withoutComments("// le chemin décodé, « js »")).find()).isFalse();
    assertThat(WSJF_KEYS.matcher("String json = decode(cods);").find()).isFalse();
  }

  /** Le code sans ses commentaires, qui peuvent citer la méthode par l'exemple. */
  private static String withoutComments(String code) {
    return code.replaceAll("(?s)/\\*.*?\\*/", "").replaceAll("(?m)//.*$", "");
  }

  private static List<String> ids(JsonNode state) {
    List<String> ids = new ArrayList<>();
    state.get("features").forEach(feature -> ids.add(feature.get("externalId").asString()));
    return ids;
  }

  /** Identifiant, critères et score de chaque fonctionnalité, dans l'ordre du tableau. */
  private static List<String> scores(JsonNode state) {
    List<String> scores = new ArrayList<>();
    state
        .get("features")
        .forEach(
            feature ->
                scores.add(
                    feature.get("externalId").asString()
                        + " "
                        + feature.get("criteria")
                        + " "
                        + feature.get("score")));
    return scores;
  }

  private static String addFeature(String externalId, String title, String criteria) {
    return "{\"type\":\"addFeature\",\"externalId\":\""
        + externalId
        + "\",\"title\":\""
        + title
        + "\",\"criteria\":"
        + criteria
        + "}";
  }

  private Created create(String name) throws Exception {
    Response response =
        send(
            HttpRequest.newBuilder(uri("/api/sessions"))
                .header("Content-Type", "application/json")
                .POST(
                    HttpRequest.BodyPublishers.ofString(
                        "{\"name\":\""
                            + name
                            + "\",\"pseudo\":\"Alice\",\"method\":\""
                            + FakeTwoCriteriaMethod.KEY
                            + "\"}",
                        StandardCharsets.UTF_8))
                .build());
    assertThat(response.status()).isEqualTo(201);
    JsonNode body = response.json();
    return new Created(
        body.get("sessionId").asString(),
        body.get("participantToken").asString(),
        body.get("animationToken").asString());
  }

  private Response upload(Created session, String fileName, byte[] content) throws Exception {
    String boundary = "----frontiere" + UUID.randomUUID();
    ByteArrayOutputStream body = new ByteArrayOutputStream();
    body.write(
        ("--"
                + boundary
                + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\""
                + fileName
                + "\"\r\nContent-Type: application/octet-stream\r\n\r\n")
            .getBytes(StandardCharsets.UTF_8));
    body.write(content);
    body.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
    return send(
        facilitator(session, "/api/sessions/" + session.sessionId() + "/imports")
            .header("Content-Type", "multipart/form-data; boundary=" + boundary)
            .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()))
            .build());
  }

  private Response confirm(Created session, String previewId) throws Exception {
    return send(
        facilitator(
                session,
                "/api/sessions/" + session.sessionId() + "/imports/" + previewId + "/confirm")
            .POST(HttpRequest.BodyPublishers.noBody())
            .build());
  }

  private HttpRequest.Builder facilitator(Created session, String path) {
    return HttpRequest.newBuilder(uri(path))
        .header("X-Participant-Token", session.participantToken())
        .header("X-Animation-Token", session.animationToken());
  }

  private Response get(String path) throws Exception {
    return send(HttpRequest.newBuilder(uri(path)).GET().build());
  }

  private URI uri(String path) {
    return URI.create("http://localhost:" + port + path);
  }

  private Response send(HttpRequest request) throws Exception {
    HttpResponse<String> response =
        http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    return new Response(response.statusCode(), response.body());
  }
}
