package com.priorisationepic;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.adapter.in.ws.WsTestClient;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Aucun jeton ni aucun contenu de message WebSocket n'apparaît dans les journaux (T119,
 * constitution III). Une session complète se déroule, refus compris (jeton inconnu, jeton
 * d'animation invalide, message hors contrat, message trop gros, import sans droit), avec les
 * journaux de l'application au niveau le plus bavard et ceux des bibliothèques aux niveaux de
 * {@code application.properties} ; la sortie capturée ne contient ensuite aucun jeton ni aucun des
 * textes envoyés.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "priorisation-epic.allowed-origins=https://front.example",
      "logging.level.com.priorisationepic=TRACE"
    })
@ExtendWith(OutputCaptureExtension.class)
class NoSecretInLogsTest extends PostgresTestBase {

  /** Marque de tous les textes envoyés : aucun ne doit ressortir dans les journaux. */
  private static final String MARK = "zq7SecretMark";

  @LocalServerPort int port;

  private final HttpClient http = HttpClient.newHttpClient();
  private final JsonMapper json = new JsonMapper();
  private final List<WsTestClient> opened = new ArrayList<>();

  @AfterEach
  void closeAll() {
    opened.forEach(client -> client.abort());
  }

  @Test
  void neitherTokensNorMessageContentsAreLogged(CapturedOutput output) throws Exception {
    JsonNode created =
        post(
            "/api/sessions",
            "{\"name\":\"Atelier "
                + MARK
                + "-name "
                + Long.toString(System.nanoTime(), 36)
                + "\",\"pseudo\":\""
                + MARK
                + "-anim\"}",
            201);
    String sessionId = created.path("sessionId").asString();
    String facilitatorToken = created.path("participantToken").asString();
    String animationToken = created.path("animationToken").asString();
    String bobToken =
        post(
                "/api/sessions/" + sessionId + "/participants",
                "{\"pseudo\":\"" + MARK + "-bob\",\"businessRole\":\"" + MARK + "-role\"}",
                201)
            .path("participantToken")
            .asString();

    WsTestClient facilitator = open(sessionId);
    facilitator.hello(facilitatorToken, animationToken);
    state(facilitator);
    WsTestClient bob = open(sessionId);
    bob.hello(bobToken);
    state(bob);

    // Intentions acceptées, avec du texte libre.
    facilitator.send(
        "{\"type\":\"addFeature\",\"externalId\":\""
            + MARK
            + "-F1\",\"title\":\""
            + MARK
            + "-title\",\"description\":\""
            + MARK
            + "-description\",\"criteria\":{\"bv\":8,\"tc\":5,\"rrOe\":3,\"js\":4}}");
    JsonNode feature = stateWith(facilitator, MARK + "-title").path("features").get(0);
    facilitator.send(
        "{\"type\":\"updateFeature\",\"featureId\":\""
            + feature.path("id").asString()
            + "\",\"version\":"
            + feature.path("version").asInt()
            + ",\"markedForReview\":true,\"reviewReason\":\""
            + MARK
            + "-reason\"}");
    stateWith(facilitator, MARK + "-reason");

    // Intentions refusées : interdite, hors contrat.
    bob.send(
        "{\"type\":\"addFeature\",\"externalId\":\"F-2\",\"title\":\"" + MARK + "-forbidden\"}");
    assertThat(bob.nextContaining("FORBIDDEN", 5_000)).isNotNull();
    bob.send("{\"type\":\"" + MARK + "-unknown\",\"payload\":\"" + MARK + "-payload\"}");
    assertThat(bob.nextContaining("INVALID_MESSAGE", 5_000)).isNotNull();

    // Jeton d'animation invalide : la connexion reste celle d'un participant, avec FORBIDDEN.
    WsTestClient intruder = open(sessionId);
    intruder.hello(bobToken, MARK + "-bad-animation-token");
    assertThat(intruder.nextContaining("FORBIDDEN", 5_000)).isNotNull();

    // Jeton de participant inconnu : fermeture 4401.
    WsTestClient stranger = open(sessionId);
    stranger.hello(MARK + "-unknown-participant-token");
    assertThat(stranger.awaitCloseCode(5_000)).isEqualTo(4401);

    // Message trop gros : fermeture 1009.
    WsTestClient flooder = open(sessionId);
    flooder.hello(bobToken);
    state(flooder);
    flooder.send(
        "{\"type\":\"addFeature\",\"externalId\":\"F-3\",\"title\":\""
            + (MARK + "-flood ").repeat(1_500)
            + "\"}");
    assertThat(flooder.awaitCloseCode(5_000)).isEqualTo(1009);

    // Import refusé : jetons dans les en-têtes, jeton d'animation invalide.
    HttpResponse<String> refused =
        http.send(
            HttpRequest.newBuilder(
                    URI.create(
                        "http://localhost:" + port + "/api/sessions/" + sessionId + "/imports"))
                .header("Content-Type", "multipart/form-data; boundary=b")
                .header("X-Participant-Token", bobToken)
                .header("X-Animation-Token", MARK + "-import-animation-token")
                .POST(
                    HttpRequest.BodyPublishers.ofString(
                        "--b\r\nContent-Disposition: form-data; name=\"file\"; filename=\""
                            + MARK
                            + ".csv\"\r\nContent-Type: text/csv\r\n\r\nIdentifiant;Titre\r\nF-9;"
                            + MARK
                            + "-import\r\n--b--\r\n",
                        StandardCharsets.UTF_8))
                .build(),
            HttpResponse.BodyHandlers.ofString());
    assertThat(refused.statusCode()).isEqualTo(403);

    bob.close();
    facilitator.abort();
    Thread.sleep(500);

    String logs = output.getAll();
    // La capture fonctionne : les connexions sont bien journalisées.
    assertThat(logs).contains("opened a connection").contains("closed a connection");
    assertThat(logs)
        .doesNotContain(facilitatorToken)
        .doesNotContain(animationToken)
        .doesNotContain(bobToken)
        .doesNotContain(MARK);
  }

  private WsTestClient open(String sessionId) throws Exception {
    WsTestClient client = WsTestClient.open(http, port, sessionId, false);
    opened.add(client);
    return client;
  }

  private JsonNode state(WsTestClient client) throws Exception {
    return stateWith(client, "\"type\":\"sessionState\"");
  }

  private JsonNode stateWith(WsTestClient client, String fragment) throws Exception {
    String text = client.nextContaining(fragment, 5_000);
    assertThat(text).as("sessionState avec %s", fragment).isNotNull();
    return json.readTree(text);
  }

  private JsonNode post(String path, String body, int expectedStatus) throws Exception {
    HttpResponse<String> response =
        http.send(
            HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build(),
            HttpResponse.BodyHandlers.ofString());
    assertThat(response.statusCode()).as(response.body()).isEqualTo(expectedStatus);
    return json.readTree(response.body());
  }
}
