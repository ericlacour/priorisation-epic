package com.priorisationepic.adapter.in.ws;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.ContractExamples;
import com.priorisationepic.ContractSchemas;
import com.priorisationepic.PostgresTestBase;
import java.net.http.HttpClient;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
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
 * Intentions de fonctionnalité, de bout en bout contre PostgreSQL (T042) : seul l'animateur écrit,
 * l'état est diffusé à toutes les connexions, les refus ne changent rien, et tous les messages
 * reçus sont valides contre le contrat.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "priorisation-epic.allowed-origins=https://front.example",
      "priorisation-epic.tick-interval=10m",
      "priorisation-epic.ping-interval=10m"
    })
class FeatureIntentsTest extends PostgresTestBase {

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;

  private final HttpClient http = HttpClient.newHttpClient();
  private final List<WsTestClient> opened = new ArrayList<>();
  private WsTestClient facilitator;
  private WsTestClient bob;

  @BeforeEach
  void seed() throws Exception {
    SessionFixtures.reset(jdbc);
    SessionFixtures.insertSession(jdbc);
    SessionFixtures.insertParticipant(jdbc, "Bob", SessionFixtures.BOB_TOKEN, "PARTICIPANT");
    facilitator = open();
    facilitator.hello(SessionFixtures.ALICE_TOKEN, SessionFixtures.ANIMATION_TOKEN);
    nextState(facilitator);
    bob = open();
    bob.hello(SessionFixtures.BOB_TOKEN);
    nextState(bob);
    nextState(facilitator); // Bob est en ligne
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

  private JsonNode nextState(WsTestClient client) throws Exception {
    String message = client.nextContaining("\"type\":\"sessionState\"", 5_000);
    assertThat(message).isNotNull();
    assertThat(ContractSchemas.violations("session-state.json", message)).isEmpty();
    return json.readTree(message);
  }

  private JsonNode nextError(WsTestClient client) throws Exception {
    String message = client.nextContaining("\"type\":\"error\"", 5_000);
    assertThat(message).isNotNull();
    assertThat(ContractSchemas.violations("error.json", message)).isEmpty();
    return json.readTree(message);
  }

  private UUID addFeature(String externalId, String criteria) throws Exception {
    facilitator.send(
        "{\"type\":\"addFeature\",\"externalId\":\""
            + externalId
            + "\",\"title\":\"Titre "
            + externalId
            + "\""
            + (criteria == null ? "" : ",\"criteria\":" + criteria)
            + "}");
    JsonNode state = nextState(facilitator);
    for (JsonNode f : state.get("features")) {
      if (f.get("externalId").asString().equals(externalId)) {
        return UUID.fromString(f.get("id").asString());
      }
    }
    throw new AssertionError("feature not in state");
  }

  private JsonNode feature(JsonNode state, UUID id) {
    for (JsonNode f : state.get("features")) {
      if (f.get("id").asString().equals(id.toString())) {
        return f;
      }
    }
    return null;
  }

  @Test
  void theContractExamplesAreAcceptedAndBroadcastToEveryConnection() throws Exception {
    facilitator.send(ContractExamples.read("add-feature", "with-criteria"));

    JsonNode forFacilitator = nextState(facilitator);
    JsonNode forBob = nextState(bob);
    assertThat(forFacilitator.get("features")).hasSize(1);
    JsonNode feature = forFacilitator.get("features").get(0);
    assertThat(feature.get("externalId").asString()).isEqualTo("F-1");
    assertThat(feature.get("score").get("rank").asInt()).isEqualTo(1);
    assertThat(feature.get("score").get("computed").get("wsjf").get("display").asString())
        .isEqualTo("4,00");
    assertThat(forBob.get("me").get("pseudo").asString()).isEqualTo("Bob");
    assertThat(forBob.get("features").get(0).get("id")).isEqualTo(feature.get("id"));
    assertThat(forBob.get("version").asInt()).isEqualTo(forFacilitator.get("version").asInt());
  }

  @Test
  void presenceIsBroadcastWhenSomeoneLeavesAndReturns() throws Exception {
    bob.socket.sendClose(1000, "bye").join();
    JsonNode state = nextState(facilitator);
    assertThat(online(state, "Bob")).isFalse();

    WsTestClient again = open();
    again.hello(SessionFixtures.BOB_TOKEN);
    assertThat(online(nextState(facilitator), "Bob")).isTrue();
  }

  private boolean online(JsonNode state, String pseudo) {
    for (JsonNode p : state.get("participants")) {
      if (p.get("pseudo").asString().equals(pseudo)) {
        return p.get("online").asBoolean();
      }
    }
    throw new AssertionError(pseudo);
  }

  @Test
  void aParticipantCannotWriteAnythingAndGetsForbidden() throws Exception {
    UUID id = addFeature("F-1", null);
    nextState(bob);
    bob.send("{\"type\":\"addFeature\",\"externalId\":\"F-2\",\"title\":\"x\"}");
    assertThat(nextError(bob).get("code").asString()).isEqualTo("FORBIDDEN");
    bob.send(
        "{\"type\":\"updateFeature\",\"featureId\":\"" + id + "\",\"version\":0,\"title\":\"x\"}");
    assertThat(nextError(bob).get("code").asString()).isEqualTo("FORBIDDEN");
    bob.send("{\"type\":\"deleteFeature\",\"featureId\":\"" + id + "\",\"version\":0}");
    assertThat(nextError(bob).get("code").asString()).isEqualTo("FORBIDDEN");
    assertThat(
            jdbc.queryForObject(
                "select count(*) from feature where deleted_at is null", Integer.class))
        .isEqualTo(1);
    assertThat(facilitator.next(300)).isNull();
  }

  @Test
  void updateChangesValuesLogsThemAndBumpsTheFeatureVersion() throws Exception {
    UUID id = addFeature("F-1", "{\"bv\":8,\"tc\":5,\"rrOe\":3,\"js\":4}");
    facilitator.send(
        "{\"type\":\"updateFeature\",\"featureId\":\""
            + id
            + "\",\"version\":0,\"criteria\":{\"js\":10,\"tc\":null}}");

    JsonNode state = nextState(facilitator);
    JsonNode feature = feature(state, id);
    assertThat(feature.get("version").asInt()).isEqualTo(1);
    assertThat(feature.get("criteria").get("js").asInt()).isEqualTo(10);
    assertThat(feature.get("criteria").has("tc")).isFalse();
    assertThat(feature.get("score").get("complete").asBoolean()).isFalse();
    assertThat(feature.get("score").get("rank").isNull()).isTrue();
    assertThat(
            jdbc.queryForList(
                "select field from change_log where action = 'VALUE_CHANGE' order by field",
                String.class))
        .containsExactly("js", "tc");
  }

  @Test
  void titleAndMarkChangesAreNotLoggedAndDoNotChangeTheRank() throws Exception {
    UUID first = addFeature("F-1", "{\"bv\":8,\"tc\":5,\"rrOe\":3,\"js\":4}");
    UUID second = addFeature("F-2", "{\"bv\":1,\"tc\":1,\"rrOe\":1,\"js\":9}");
    facilitator.send(
        "{\"type\":\"updateFeature\",\"featureId\":\""
            + second
            + "\",\"version\":0,\"title\":\"Autre\",\"markedForReview\":true,\"reviewReason\":\"à discuter\"}");
    JsonNode state = nextState(facilitator);
    JsonNode marked = feature(state, second);
    assertThat(marked.get("markedForReview").asBoolean()).isTrue();
    assertThat(marked.get("reviewReason").asString()).isEqualTo("à discuter");
    assertThat(marked.get("score").get("rank").asInt()).isEqualTo(2);
    assertThat(feature(state, first).get("score").get("rank").asInt()).isEqualTo(1);
    assertThat(jdbc.queryForObject("select count(*) from change_log", Integer.class)).isZero();
  }

  @Test
  void aStaleVersionGetsTheErrorWithTheFeatureAndChangesNothing() throws Exception {
    UUID id = addFeature("F-1", null);
    facilitator.send(
        "{\"type\":\"updateFeature\",\"featureId\":\"" + id + "\",\"version\":0,\"title\":\"Un\"}");
    nextState(facilitator);
    facilitator.send(
        "{\"type\":\"updateFeature\",\"featureId\":\""
            + id
            + "\",\"version\":0,\"title\":\"Deux\"}");

    JsonNode error = nextError(facilitator);
    assertThat(error.get("code").asString()).isEqualTo("STALE_VERSION");
    assertThat(error.get("featureId").asString()).isEqualTo(id.toString());
    assertThat(jdbc.queryForObject("select title from feature where id = ?", String.class, id))
        .isEqualTo("Un");
  }

  @Test
  void invalidValuesDuplicatesAndUnknownCriteriaAreRefused() throws Exception {
    addFeature("F-1", null);
    facilitator.send("{\"type\":\"addFeature\",\"externalId\":\"f-1\",\"title\":\"x\"}");
    assertThat(nextError(facilitator).get("code").asString()).isEqualTo("DUPLICATE_EXTERNAL_ID");
    facilitator.send(
        "{\"type\":\"addFeature\",\"externalId\":\"F-2\",\"title\":\"x\",\"criteria\":{\"bv\":11}}");
    assertThat(nextError(facilitator).get("code").asString()).isEqualTo("INVALID_VALUE");
    facilitator.send(
        "{\"type\":\"addFeature\",\"externalId\":\"F-2\",\"title\":\"x\",\"criteria\":{\"zz\":1}}");
    assertThat(nextError(facilitator).get("code").asString()).isEqualTo("UNKNOWN_CRITERION");
    assertThat(jdbc.queryForObject("select count(*) from feature", Integer.class)).isEqualTo(1);
  }

  @Test
  void messagesOutsideTheSchemaGetInvalidMessage() throws Exception {
    for (String payload :
        new String[] {
          "{\"type\":\"addFeature\",\"title\":\"x\"}",
          "{\"type\":\"addFeature\",\"externalId\":\"F\",\"title\":\"x\",\"extra\":1}",
          "{\"type\":\"addFeature\",\"externalId\":\"F\",\"title\":\"x\",\"criteria\":{\"bv\":0}}",
          "{\"type\":\"addFeature\",\"externalId\":\"F\",\"title\":\"x\",\"criteria\":{\"bv\":1.5}}",
          "{\"type\":\"addFeature\",\"externalId\":\"F\",\"title\":\"x\",\"criteria\":{\"Bad Key\":1}}",
          "{\"type\":\"updateFeature\",\"featureId\":\"nope\",\"version\":0}",
          "{\"type\":\"updateFeature\",\"featureId\":\"6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f\"}",
          "{\"type\":\"updateFeature\",\"featureId\":\"6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f\",\"version\":-1}",
          "{\"type\":\"deleteFeature\",\"featureId\":\"6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f\"}"
        }) {
      facilitator.send(payload);
      assertThat(nextError(facilitator).get("code").asString())
          .as(payload)
          .isEqualTo("INVALID_MESSAGE");
    }
  }

  @Test
  void deletingIsBroadcastAndFreesTheIdentifier() throws Exception {
    UUID id = addFeature("F-1", "{\"bv\":3}");
    nextState(bob);
    facilitator.send("{\"type\":\"deleteFeature\",\"featureId\":\"" + id + "\",\"version\":0}");
    assertThat(nextState(facilitator).get("features")).isEmpty();
    assertThat(nextState(bob).get("features")).isEmpty();
    assertThat(jdbc.queryForObject("select count(*) from change_log", Integer.class)).isZero();
    addFeature("F-1", null);
  }

  @Test
  void aHeartbeatWithin30SecondsOfTheLastWriteDoesNotRewriteLastSeen() throws Exception {
    UUID bobId = jdbc.queryForObject("select id from participant where pseudo = 'Bob'", UUID.class);
    Timestamp afterHello =
        jdbc.queryForObject(
            "select last_seen_at from participant where id = ?", Timestamp.class, bobId);
    bob.send("{\"type\":\"heartbeat\"}");
    Thread.sleep(300);
    Timestamp afterHeartbeat =
        jdbc.queryForObject(
            "select last_seen_at from participant where id = ?", Timestamp.class, bobId);
    assertThat(afterHeartbeat).isEqualTo(afterHello);
  }
}
