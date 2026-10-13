package com.priorisationepic.adapter.in.ws;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.ContractSchemas;
import com.priorisationepic.PostgresTestBase;
import java.net.http.HttpClient;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
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
 * Intentions {@code addFeature}, {@code updateFeature} et {@code deleteFeature} de bout en bout,
 * contre PostgreSQL, avec deux connexions : l'animateur (jeton d'animation) et un participant.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "priorisation-epic.allowed-origins=https://front.example",
      "priorisation-epic.tick-interval=10m",
      "priorisation-epic.ping-interval=10m"
    })
class FeatureIntentsTest extends PostgresTestBase {

  private static final String ALL_VALUES = "{\"bv\":8,\"tc\":5,\"rrOe\":3,\"js\":4}";

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
    // Alice apprend l'arrivée de Bob en ligne.
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

  /** Le prochain {@code sessionState} reçu, déjà vérifié contre le contrat. */
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

  private void expectNothing(WsTestClient client) throws Exception {
    assertThat(client.next(400)).isNull();
  }

  private String add(String externalId, String title, String criteria) {
    return "{\"type\":\"addFeature\",\"externalId\":\""
        + externalId
        + "\",\"title\":\""
        + title
        + "\""
        + (criteria == null ? "" : ",\"criteria\":" + criteria)
        + "}";
  }

  private JsonNode feature(JsonNode state, String externalId) {
    for (JsonNode feature : state.get("features")) {
      if (feature.get("externalId").asString().equals(externalId)) {
        return feature;
      }
    }
    throw new AssertionError("Fonctionnalité absente : " + externalId);
  }

  private String update(JsonNode feature, String fields) {
    return "{\"type\":\"updateFeature\",\"featureId\":\""
        + feature.get("id").asString()
        + "\",\"version\":"
        + feature.get("version").asInt()
        + (fields.isEmpty() ? "" : "," + fields)
        + "}";
  }

  private int count(String sql, Object... args) {
    return jdbc.queryForObject(sql, Integer.class, args);
  }

  // --- Droits ---------------------------------------------------------------------------------

  @Test
  void onlyTheFacilitatorCanWrite() throws Exception {
    bob.send(add("F-1", "Paiement", ALL_VALUES));

    assertThat(error(bob).get("code").asString()).isEqualTo("FORBIDDEN");
    expectNothing(alice);
    assertThat(count("select count(*) from feature")).isZero();
  }

  @Test
  void aParticipantCannotUpdateNorDelete() throws Exception {
    alice.send(add("F-1", "Paiement", ALL_VALUES));
    JsonNode created = feature(state(alice), "F-1");
    state(bob);

    bob.send(update(created, "\"criteria\":{\"bv\":1}"));
    assertThat(error(bob).get("code").asString()).isEqualTo("FORBIDDEN");
    bob.send(
        "{\"type\":\"deleteFeature\",\"featureId\":\""
            + created.get("id").asString()
            + "\",\"version\":0}");
    assertThat(error(bob).get("code").asString()).isEqualTo("FORBIDDEN");

    assertThat(count("select count(*) from feature where deleted_at is null")).isEqualTo(1);
    assertThat(count("select value from feature_criterion_value where criterion_key = 'bv'"))
        .isEqualTo(8);
  }

  @Test
  void aFacilitatorWithoutTheAnimationTokenIsAPlainParticipant() throws Exception {
    WsTestClient noToken = open();
    noToken.hello(SessionFixtures.ALICE_TOKEN);
    state(noToken);

    noToken.send(add("F-1", "Paiement", null));

    assertThat(error(noToken).get("code").asString()).isEqualTo("FORBIDDEN");
  }

  // --- Ajout et diffusion ---------------------------------------------------------------------

  @Test
  void addingAFeatureBroadcastsASessionStateToEveryConnection() throws Exception {
    alice.send(add("F-1", "Paiement", ALL_VALUES));

    JsonNode forAlice = state(alice);
    JsonNode forBob = state(bob);

    for (JsonNode state : List.of(forAlice, forBob)) {
      JsonNode f1 = feature(state, "F-1");
      assertThat(f1.get("title").asString()).isEqualTo("Paiement");
      assertThat(f1.get("criteria").get("bv").asInt()).isEqualTo(8);
      assertThat(f1.get("score").get("complete").asBoolean()).isTrue();
      assertThat(f1.get("score").get("computed").get("cod").get("display").asString())
          .isEqualTo("16");
      assertThat(f1.get("score").get("computed").get("wsjf").get("display").asString())
          .isEqualTo("4,00");
      assertThat(f1.get("score").get("explanation").asString())
          .isEqualTo("CoD = 8 + 5 + 3 = 16 ; WSJF = 16 / 4 = 4,00");
      assertThat(f1.get("score").get("rank").asInt()).isEqualTo(1);
    }
    assertThat(forAlice.get("me").get("role").asString()).isEqualTo("FACILITATOR");
    assertThat(forBob.get("me").get("role").asString()).isEqualTo("PARTICIPANT");
    assertThat(forBob.get("version").asInt()).isGreaterThan(0);
    assertThat(count("select count(*) from change_log")).isZero();
  }

  @Test
  void theBoardIsSortedAndResortedForEveryone() throws Exception {
    alice.send(add("F-1", "Paiement", ALL_VALUES));
    state(alice);
    state(bob);
    alice.send(add("F-2", "Export", "{\"bv\":2,\"tc\":2,\"rrOe\":2,\"js\":3}"));
    JsonNode two = state(alice);
    state(bob);

    assertThat(two.get("features").get(0).get("externalId").asString()).isEqualTo("F-1");
    assertThat(two.get("features").get(1).get("externalId").asString()).isEqualTo("F-2");

    // JS de F-1 : 4 -> 10, donc WSJF 1,60 et F-2 (2,00) passe en tête.
    alice.send(update(feature(two, "F-1"), "\"criteria\":{\"js\":10}"));
    for (WsTestClient client : List.of(alice, bob)) {
      JsonNode resorted = state(client);
      assertThat(resorted.get("features").get(0).get("externalId").asString()).isEqualTo("F-2");
      assertThat(
              feature(resorted, "F-1")
                  .get("score")
                  .get("computed")
                  .get("wsjf")
                  .get("display")
                  .asString())
          .isEqualTo("1,60");
      assertThat(feature(resorted, "F-1").get("score").get("rank").asInt()).isEqualTo(2);
    }
  }

  @Test
  void anIncompleteFeatureShowsNoComputedValue() throws Exception {
    alice.send(add("F-1", "Sans valeurs", "{\"bv\":8,\"tc\":null}"));

    JsonNode f1 = feature(state(alice), "F-1");

    assertThat(f1.get("score").get("complete").asBoolean()).isFalse();
    assertThat(f1.get("score").get("computed").isNull()).isTrue();
    assertThat(f1.get("score").get("explanation").isNull()).isTrue();
    assertThat(f1.get("criteria").has("tc")).isFalse();
  }

  // --- Modification, historique et version ----------------------------------------------------

  @Test
  void changingAValueIsTracedInTheHistoryButTitleChangesAreNot() throws Exception {
    alice.send(add("F-1", "Paiement", ALL_VALUES));
    JsonNode created = feature(state(alice), "F-1");
    state(bob);

    alice.send(update(created, "\"criteria\":{\"bv\":9,\"tc\":5}"));
    JsonNode afterValues = feature(state(alice), "F-1");
    alice.send(
        update(afterValues, "\"title\":\"Paiement express\",\"description\":\"Sans carte\""));
    JsonNode afterTitle = feature(state(alice), "F-1");

    assertThat(afterTitle.get("title").asString()).isEqualTo("Paiement express");
    assertThat(afterTitle.get("description").asString()).isEqualTo("Sans carte");
    assertThat(afterTitle.get("version").asInt()).isEqualTo(2);
    assertThat(count("select count(*) from change_log")).isEqualTo(1);
    assertThat(
            jdbc.queryForMap(
                "select action, field, old_value::text as old_value, new_value::text as new_value,"
                    + " author_pseudo from change_log"))
        .containsEntry("action", "VALUE_CHANGE")
        .containsEntry("field", "bv")
        .containsEntry("old_value", "8")
        .containsEntry("new_value", "9")
        .containsEntry("author_pseudo", "Alice");
  }

  @Test
  void aStaleVersionGetsStaleVersionWithTheFeatureAndChangesNothing() throws Exception {
    alice.send(add("F-1", "Paiement", ALL_VALUES));
    JsonNode created = feature(state(alice), "F-1");
    state(bob);
    alice.send(update(created, "\"criteria\":{\"js\":10}"));
    state(alice);
    state(bob);

    alice.send(update(created, "\"criteria\":{\"js\":2}"));

    JsonNode error = error(alice);
    assertThat(error.get("code").asString()).isEqualTo("STALE_VERSION");
    assertThat(error.get("featureId").asString()).isEqualTo(created.get("id").asString());
    expectNothing(bob);
    assertThat(count("select value from feature_criterion_value where criterion_key = 'js'"))
        .isEqualTo(10);
  }

  @Test
  void invalidValuesUnknownCriteriaAndDuplicatesAreRefused() throws Exception {
    alice.send(add("F-1", "Paiement", ALL_VALUES));
    JsonNode created = feature(state(alice), "F-1");
    state(bob);

    alice.send(add("F-2", "Hors échelle", "{\"bv\":11}"));
    assertThat(error(alice).get("code").asString()).isEqualTo("INVALID_VALUE");
    alice.send(add("F-2", "Critère inconnu", "{\"reach\":3}"));
    assertThat(error(alice).get("code").asString()).isEqualTo("UNKNOWN_CRITERION");
    alice.send(add("f-1", "Doublon", null));
    assertThat(error(alice).get("code").asString()).isEqualTo("DUPLICATE_EXTERNAL_ID");
    alice.send(update(created, "\"criteria\":{\"js\":0}"));
    assertThat(error(alice).get("code").asString()).isEqualTo("INVALID_MESSAGE");
    alice.send(update(created, "\"criteria\":{\"js\":11}"));
    assertThat(error(alice).get("code").asString()).isEqualTo("INVALID_VALUE");

    assertThat(count("select count(*) from feature")).isEqualTo(1);
    expectNothing(bob);
  }

  @Test
  void theMarkForReviewIsBroadcastWithoutChangingTheScore() throws Exception {
    alice.send(add("F-1", "Paiement", ALL_VALUES));
    JsonNode created = feature(state(alice), "F-1");
    state(bob);

    alice.send(update(created, "\"markedForReview\":true,\"reviewReason\":\"À confirmer\""));

    JsonNode marked = feature(state(bob), "F-1");
    assertThat(marked.get("markedForReview").asBoolean()).isTrue();
    assertThat(marked.get("reviewReason").asString()).isEqualTo("À confirmer");
    assertThat(marked.get("score")).isEqualTo(created.get("score"));
    assertThat(count("select count(*) from change_log")).isZero();
  }

  // --- Suppression ----------------------------------------------------------------------------

  @Test
  void deletingAFeatureRemovesItForEveryoneButKeepsTheRow() throws Exception {
    alice.send(add("F-1", "Paiement", ALL_VALUES));
    JsonNode created = feature(state(alice), "F-1");
    state(bob);

    alice.send(
        "{\"type\":\"deleteFeature\",\"featureId\":\""
            + created.get("id").asString()
            + "\",\"version\":"
            + created.get("version").asInt()
            + "}");

    assertThat(state(alice).get("features")).isEmpty();
    assertThat(state(bob).get("features")).isEmpty();
    assertThat(count("select count(*) from feature where deleted_at is not null")).isEqualTo(1);
    assertThat(count("select count(*) from change_log")).isZero();
  }

  // --- Messages hors contrat ------------------------------------------------------------------

  @Test
  void messagesOutsideTheContractGetInvalidMessageAndChangeNothing() throws Exception {
    String uuid = UUID.randomUUID().toString();
    for (String payload :
        new String[] {
          "{\"type\":\"addFeature\",\"title\":\"x\"}",
          "{\"type\":\"addFeature\",\"externalId\":\"F\"}",
          "{\"type\":\"addFeature\",\"externalId\":\"\",\"title\":\"x\"}",
          "{\"type\":\"addFeature\",\"externalId\":\"" + "x".repeat(51) + "\",\"title\":\"x\"}",
          "{\"type\":\"addFeature\",\"externalId\":\"F\",\"title\":\"" + "x".repeat(201) + "\"}",
          "{\"type\":\"addFeature\",\"externalId\":\"F\",\"title\":\"x\",\"description\":\""
              + "x".repeat(5001)
              + "\"}",
          "{\"type\":\"addFeature\",\"externalId\":\"F\",\"title\":\"x\",\"extra\":1}",
          "{\"type\":\"addFeature\",\"externalId\":\"F\",\"title\":\"x\",\"criteria\":{\"BV\":3}}",
          "{\"type\":\"addFeature\",\"externalId\":\"F\",\"title\":\"x\",\"criteria\":{\"bv\":\"3\"}}",
          "{\"type\":\"addFeature\",\"externalId\":\"F\",\"title\":\"x\",\"criteria\":{\"bv\":2.5}}",
          "{\"type\":\"addFeature\",\"externalId\":\"F\",\"title\":\"x\",\"criteria\":[]}",
          "{\"type\":\"addFeature\",\"externalId\":7,\"title\":\"x\"}",
          "{\"type\":\"updateFeature\",\"version\":0}",
          "{\"type\":\"updateFeature\",\"featureId\":\"nope\",\"version\":0}",
          "{\"type\":\"updateFeature\",\"featureId\":\"" + uuid + "\"}",
          "{\"type\":\"updateFeature\",\"featureId\":\"" + uuid + "\",\"version\":-1}",
          "{\"type\":\"updateFeature\",\"featureId\":\"" + uuid + "\",\"version\":\"1\"}",
          "{\"type\":\"updateFeature\",\"featureId\":\""
              + uuid
              + "\",\"version\":0,\"markedForReview\":\"yes\"}",
          "{\"type\":\"updateFeature\",\"featureId\":\""
              + uuid
              + "\",\"version\":0,\"reviewReason\":\""
              + "x".repeat(201)
              + "\"}",
          "{\"type\":\"deleteFeature\",\"featureId\":\"" + uuid + "\"}",
          "{\"type\":\"deleteFeature\",\"featureId\":\"" + uuid + "\",\"version\":0,\"extra\":1}"
        }) {
      alice.send(payload);
      assertThat(error(alice).get("code").asString()).as(payload).isEqualTo("INVALID_MESSAGE");
    }
    assertThat(count("select count(*) from feature")).isZero();
    expectNothing(bob);
  }

  @Test
  void anIntentAlreadySatisfiedStillAnswersWithTheUnchangedState() throws Exception {
    alice.send(add("F-1", "Paiement", null));
    JsonNode added = feature(state(alice), "F-1");
    state(bob);

    alice.send(update(added, "\"title\":\"Paiement\""));

    JsonNode unchanged = feature(state(alice), "F-1");
    assertThat(unchanged.get("version").asInt()).isEqualTo(added.get("version").asInt());
  }

  @Test
  void anUnexpectedFailureGetsInvalidMessageSoTheClientStopsWaiting() throws Exception {
    // Panne de la base pendant l'intention : la table est momentanément introuvable.
    jdbc.execute("alter table feature rename to feature_unavailable");
    try {
      alice.send(add("F-1", "Paiement", null));
      assertThat(error(alice).get("code").asString()).isEqualTo("INVALID_MESSAGE");
    } finally {
      jdbc.execute("alter table feature_unavailable rename to feature");
    }
    expectNothing(bob);
  }

  // --- Présence -------------------------------------------------------------------------------

  @Test
  void aHeartbeatWritesLastSeenAtMostOnceEvery30Seconds() throws Exception {
    UUID aliceId =
        jdbc.queryForObject("select id from participant where pseudo = 'Alice'", UUID.class);
    jdbc.update(
        "update participant set last_seen_at = now() - interval '1 hour' where id = ?", aliceId);

    alice.send("{\"type\":\"heartbeat\"}");
    expectNothing(alice);

    // Le hello vient d'écrire la dernière activité : ce heartbeat, moins de 30 s plus tard, n'écrit
    // pas.
    Timestamp lastSeen =
        jdbc.queryForObject(
            "select last_seen_at from participant where id = ?", Timestamp.class, aliceId);
    assertThat(lastSeen.toInstant()).isBefore(Instant.now().minusSeconds(30 * 60));
  }

  @Test
  void onlineFollowsTheConnections() throws Exception {
    bob.socket.sendClose(1000, "bye").join();

    JsonNode afterClose = state(alice);

    boolean bobOnline = true;
    for (JsonNode participant : afterClose.get("participants")) {
      if (participant.get("pseudo").asString().equals("Bob")) {
        bobOnline = participant.get("online").asBoolean();
      }
    }
    assertThat(bobOnline).isFalse();
    assertThat(bob.closeCode.get(5, TimeUnit.SECONDS)).isEqualTo(1000);
  }
}
