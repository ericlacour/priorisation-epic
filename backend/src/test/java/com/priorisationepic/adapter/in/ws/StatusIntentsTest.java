package com.priorisationepic.adapter.in.ws;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.ContractSchemas;
import com.priorisationepic.PostgresTestBase;
import java.net.http.HttpClient;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Intention {@code changeStatus} de bout en bout, contre PostgreSQL (FR-004, FR-026) : démarrer,
 * clôturer, rouvrir, et la lecture seule d'une session clôturée pour toutes les écritures.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "priorisation-epic.allowed-origins=https://front.example",
      "priorisation-epic.tick-interval=10m",
      "priorisation-epic.ping-interval=10m"
    })
class StatusIntentsTest extends PostgresTestBase {

  private static final String START = "{\"type\":\"changeStatus\",\"action\":\"START\"}";
  private static final String CLOSE = "{\"type\":\"changeStatus\",\"action\":\"CLOSE\"}";
  private static final String REOPEN = "{\"type\":\"changeStatus\",\"action\":\"REOPEN\"}";

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;

  private final HttpClient http = HttpClient.newHttpClient();
  private final JsonMapper json = new JsonMapper();
  private final List<WsTestClient> opened = new ArrayList<>();
  private WsTestClient alice;
  private WsTestClient bob;

  @BeforeEach
  void connect() throws Exception {
    SessionFixtures.reset(jdbc);
    SessionFixtures.insertSession(jdbc);
    SessionFixtures.insertParticipant(jdbc, "Bob", SessionFixtures.BOB_TOKEN, "PARTICIPANT");
    alice = open();
    alice.hello(SessionFixtures.ALICE_TOKEN, SessionFixtures.ANIMATION_TOKEN);
    state(alice);
    bob = open();
    bob.hello(SessionFixtures.BOB_TOKEN);
    state(bob);
    state(alice);
  }

  @AfterEach
  void closeAll() {
    opened.forEach(c -> c.socket.abort());
  }

  private WsTestClient open() throws Exception {
    WsTestClient client = WsTestClient.open(http, port, SessionFixtures.SESSION_ID, false);
    opened.add(client);
    return client;
  }

  private JsonNode state(WsTestClient client) throws Exception {
    String text = client.nextContaining("\"type\":\"sessionState\"", 5_000);
    assertThat(text).as("sessionState attendu").isNotNull();
    assertThat(ContractSchemas.validate("session-state", text)).isEmpty();
    return json.readTree(text);
  }

  private String error(WsTestClient client) throws Exception {
    String text = client.nextContaining("\"type\":\"error\"", 5_000);
    assertThat(text).as("error attendu").isNotNull();
    assertThat(ContractSchemas.validate("error", text)).isEmpty();
    return json.readTree(text).get("code").asString();
  }

  private String status() {
    return jdbc.queryForObject("select status from session", String.class);
  }

  /** Démarre puis clôture la session ; Alice et Bob ont reçu les deux états. */
  private void startThenClose() throws Exception {
    alice.send(START);
    state(alice);
    state(bob);
    alice.send(CLOSE);
    state(alice);
    assertThat(state(bob).get("status").asString()).isEqualTo("CLOSED");
  }

  @Test
  void aParticipantCannotChangeTheStatus() throws Exception {
    bob.send(START);

    assertThat(error(bob)).isEqualTo("FORBIDDEN");
    assertThat(status()).isEqualTo("PREPARATION");
  }

  @Test
  void startCloseAndReopenReachEveryone() throws Exception {
    alice.send(START);
    JsonNode started = state(bob);
    assertThat(started.get("status").asString()).isEqualTo("IN_PROGRESS");
    state(alice);

    alice.send(CLOSE);
    JsonNode closed = state(bob);
    assertThat(closed.get("status").asString()).isEqualTo("CLOSED");
    assertThat(closed.get("version").asInt()).isGreaterThan(started.get("version").asInt());
    state(alice);

    alice.send(REOPEN);
    assertThat(state(bob).get("status").asString()).isEqualTo("IN_PROGRESS");
    assertThat(status()).isEqualTo("IN_PROGRESS");
  }

  @Test
  void startingTwiceChangesNothingButAnswersWithTheState() throws Exception {
    alice.send(START);
    int version = state(alice).get("version").asInt();
    state(bob);

    alice.send(START);

    JsonNode again = state(alice);
    assertThat(again.get("status").asString()).isEqualTo("IN_PROGRESS");
    assertThat(again.get("version").asInt()).isEqualTo(version);
  }

  @Test
  void aSessionInPreparationCannotBeClosed() throws Exception {
    alice.send(CLOSE);

    assertThat(error(alice)).isEqualTo("SESSION_NOT_STARTED");
    assertThat(status()).isEqualTo("PREPARATION");
  }

  @Test
  void aClosedSessionRefusesEveryWriteButReopen() throws Exception {
    alice.send(
        "{\"type\":\"addFeature\",\"externalId\":\"F-1\",\"title\":\"Paiement\","
            + "\"criteria\":{\"bv\":8}}");
    JsonNode feature = state(alice).get("features").get(0);
    state(bob);
    startThenClose();
    String id = feature.get("id").asString();
    int version = feature.get("version").asInt();

    String[] writes = {
      "{\"type\":\"addFeature\",\"externalId\":\"F-2\",\"title\":\"Autre\"}",
      "{\"type\":\"updateFeature\",\"featureId\":\""
          + id
          + "\",\"version\":"
          + version
          + ",\"title\":\"Renommée\"}",
      "{\"type\":\"deleteFeature\",\"featureId\":\"" + id + "\",\"version\":" + version + "}",
      "{\"type\":\"updateSettings\",\"name\":\"Autre nom\"}",
      START,
      CLOSE
    };
    for (String write : writes) {
      alice.send(write);
      assertThat(error(alice)).as(write).isEqualTo("SESSION_CLOSED");
    }
    assertThat(bob.next(400)).isNull();
    assertThat(jdbc.queryForObject("select count(*) from feature", Integer.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject("select title from feature", String.class))
        .isEqualTo("Paiement");
    assertThat(jdbc.queryForObject("select name from session", String.class)).isEqualTo("Atelier");

    alice.send(REOPEN);
    assertThat(state(bob).get("status").asString()).isEqualTo("IN_PROGRESS");
  }

  @Test
  void anUnknownActionIsAnInvalidMessage() throws Exception {
    alice.send("{\"type\":\"changeStatus\",\"action\":\"ARCHIVE\"}");
    assertThat(error(alice)).isEqualTo("INVALID_MESSAGE");

    alice.send("{\"type\":\"changeStatus\"}");
    assertThat(error(alice)).isEqualTo("INVALID_MESSAGE");

    alice.send("{\"type\":\"changeStatus\",\"action\":\"START\",\"confirm\":true}");
    assertThat(error(alice)).isEqualTo("INVALID_MESSAGE");
    assertThat(status()).isEqualTo("PREPARATION");
  }
}
