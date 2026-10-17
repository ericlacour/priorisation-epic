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

/** Intention {@code updateSettings} de bout en bout, contre PostgreSQL (FR-010, FR-011). */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "priorisation-epic.allowed-origins=https://front.example",
      "priorisation-epic.tick-interval=10m",
      "priorisation-epic.ping-interval=10m"
    })
class SettingsIntentsTest extends PostgresTestBase {

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

  private JsonNode error(WsTestClient client) throws Exception {
    String text = client.nextContaining("\"type\":\"error\"", 5_000);
    assertThat(text).as("error attendu").isNotNull();
    assertThat(ContractSchemas.validate("error", text)).isEmpty();
    return json.readTree(text);
  }

  private static String scale(String type, int max, boolean confirm) {
    return "{\"type\":\"updateSettings\",\"scale\":{\"type\":\""
        + type
        + "\",\"max\":"
        + max
        + "}"
        + (confirm ? ",\"confirm\":true" : "")
        + "}";
  }

  private int count(String sql) {
    return jdbc.queryForObject(sql, Integer.class);
  }

  @Test
  void aParticipantCannotChangeTheScale() throws Exception {
    bob.send(scale("CONTINUOUS", 20, false));

    assertThat(error(bob).get("code").asString()).isEqualTo("FORBIDDEN");
    assertThat(count("select scale_max from session")).isEqualTo(10);
  }

  @Test
  void theNewScaleReachesEveryone() throws Exception {
    alice.send(scale("FIBONACCI", 20, false));

    JsonNode forBob = state(bob);
    assertThat(forBob.get("scale").get("type").asString()).isEqualTo("FIBONACCI");
    assertThat(forBob.get("scale").get("allowedValues").toString()).isEqualTo("[1,2,3,5,8,13,20]");
    assertThat(state(alice).get("scale").get("max").asInt()).isEqualTo(20);
    assertThat(count("select count(*) from change_log where action = 'SCALE_CHANGE'")).isEqualTo(1);
  }

  @Test
  void anImpactingChangeIsAnnouncedThenAppliedOnConfirmation() throws Exception {
    alice.send(
        "{\"type\":\"addFeature\",\"externalId\":\"F-1\",\"title\":\"Paiement\","
            + "\"criteria\":{\"bv\":4,\"tc\":5,\"rrOe\":3,\"js\":10}}");
    state(alice);
    state(bob);

    alice.send(scale("FIBONACCI", 13, false));
    JsonNode refused = error(alice);
    assertThat(refused.get("code").asString()).isEqualTo("SCALE_IMPACT");
    assertThat(refused.get("impactedValues").toString())
        .isEqualTo(
            "[{\"externalId\":\"F-1\",\"criterion\":\"bv\",\"value\":4},"
                + "{\"externalId\":\"F-1\",\"criterion\":\"js\",\"value\":10}]");
    assertThat(bob.next(400)).isNull();

    alice.send(scale("FIBONACCI", 13, true));
    JsonNode feature = state(bob).get("features").get(0);
    assertThat(feature.get("criteria").get("bv").asInt()).isEqualTo(4);
    assertThat(feature.get("score").get("complete").asBoolean()).isFalse();
    assertThat(feature.get("score").get("outOfScale").toString()).isEqualTo("[\"bv\",\"js\"]");
  }

  @Test
  void renamingNeedsNoConfirmation() throws Exception {
    alice.send("{\"type\":\"updateSettings\",\"name\":\"PI 28\"}");

    assertThat(state(bob).get("name").asString()).isEqualTo("PI 28");
  }

  @Test
  void renamingToTheNameOfAnotherSessionIsRefusedAndTheNameIsKept() throws Exception {
    jdbc.update(
        "insert into session (session_id, animation_token_hash, name, status, method,"
            + " method_version, scale_type, scale_max, created_at, created_by_pseudo)"
            + " values ('BBBBBBBBBBBBBBBBBBBBBB', 'x', 'PI26T7_TEST', 'PREPARATION', 'WSJF', 1,"
            + " 'CONTINUOUS', 10, now(), 'Carole')");

    alice.send("{\"type\":\"updateSettings\",\"name\":\" pi26t7_test \"}");

    assertThat(error(alice).get("code").asString()).isEqualTo("SESSION_NAME_TAKEN");
    assertThat(
            jdbc.queryForObject(
                "select name from session where session_id = ?",
                String.class,
                SessionFixtures.SESSION_ID))
        .isEqualTo("Atelier");
  }

  @Test
  void anOutOfContractMessageIsInvalid() throws Exception {
    alice.send("{\"type\":\"updateSettings\"}");
    assertThat(error(alice).get("code").asString()).isEqualTo("INVALID_MESSAGE");

    alice.send("{\"type\":\"updateSettings\",\"scale\":{\"type\":\"LOG\",\"max\":10}}");
    assertThat(error(alice).get("code").asString()).isEqualTo("INVALID_MESSAGE");
  }

  @Test
  void aFibonacciBoundOutsideTheSequenceIsAnInvalidValue() throws Exception {
    alice.send(scale("FIBONACCI", 10, true));

    assertThat(error(alice).get("code").asString()).isEqualTo("INVALID_VALUE");
  }
}
