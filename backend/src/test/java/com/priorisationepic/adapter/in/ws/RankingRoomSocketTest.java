package com.priorisationepic.adapter.in.ws;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.ContractExamples;
import com.priorisationepic.ContractSchemas;
import com.priorisationepic.PostgresTestBase;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
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
 * Salle de classement collaboratif de bout en bout, contre PostgreSQL (FR-015b, FR-015c) : chaque
 * intention acceptée envoie le même {@code rankingRoom} à toutes les connexions, sans {@code
 * sessionState} ; une connexion ouverte pendant un classement reçoit son état puis la salle.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "priorisation-epic.allowed-origins=https://front.example",
      "priorisation-epic.tick-interval=10m",
      "priorisation-epic.ping-interval=10m"
    })
class RankingRoomSocketTest extends PostgresTestBase {

  /** Les fonctionnalités des exemples du contrat (contract/examples/update-ranking-draft). */
  private static final UUID F1 = UUID.fromString("6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f");

  private static final UUID F2 = UUID.fromString("7a2d3e4f-5c6b-4d8e-9fa0-1b2c3d4e5f60");
  private static final UUID F3 = UUID.fromString("8b3e4f50-6d7c-4e9f-8a01-2c3d4e5f6071");

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
    insertFeature(F1, "F-1");
    insertFeature(F2, "F-2");
    insertFeature(F3, "F-3");
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

  private void insertFeature(UUID id, String externalId) {
    jdbc.update(
        "insert into feature (id, session_id, external_id, title) values (?, ?, ?, ?)",
        id,
        SessionFixtures.SESSION_ID,
        externalId,
        "Fonctionnalité " + externalId);
  }

  private WsTestClient open() throws Exception {
    WsTestClient client = WsTestClient.open(http, port, SessionFixtures.SESSION_ID, false);
    opened.add(client);
    return client;
  }

  private JsonNode state(WsTestClient client) throws Exception {
    String text = client.nextContaining("\"type\":\"sessionState\"", 5_000);
    assertThat(text).as("sessionState attendu").isNotNull();
    return json.readTree(text);
  }

  private JsonNode room(WsTestClient client) throws Exception {
    String text = client.nextContaining("\"type\":\"rankingRoom\"", 5_000);
    assertThat(text).as("rankingRoom attendu").isNotNull();
    assertThat(ContractSchemas.validate("ranking-room", text)).as(text).isEmpty();
    return json.readTree(text);
  }

  private String error(WsTestClient client) throws Exception {
    String text = client.nextContaining("\"type\":\"error\"", 5_000);
    assertThat(text).as("error attendu").isNotNull();
    assertThat(ContractSchemas.validate("error", text)).isEmpty();
    return json.readTree(text).get("code").asString();
  }

  /** La salle suivante, la même chez Alice et chez Bob. */
  private JsonNode roomForBoth() throws Exception {
    JsonNode seenByAlice = room(alice);
    assertThat(room(bob)).isEqualTo(seenByAlice);
    return seenByAlice;
  }

  private void openRoom() throws Exception {
    alice.send(ContractExamples.read("update-ranking-draft", "live"));
    room(alice);
    room(bob);
  }

  @Test
  void theDraftReachesEveryoneWithoutAnyNewSessionState() throws Exception {
    alice.send(ContractExamples.read("update-ranking-draft", "live"));

    JsonNode seenByBob = room(bob);
    assertThat(seenByBob.get("active").asBoolean()).isTrue();
    assertThat(seenByBob.get("live").asBoolean()).isTrue();
    assertThat(seenByBob.get("draft").get("levels").get(0).get(0).asString())
        .isEqualTo(F1.toString());
    assertThat(seenByBob.get("spotlightFeatureId").isNull()).isTrue();
    assertThat(room(alice).get("facilitatorId").isString()).isTrue();
    assertThat(bob.nextContaining("\"type\":\"sessionState\"", 500)).isNull();
    assertThat(jdbc.queryForObject("select version from session", Integer.class)).isZero();
  }

  @Test
  void everyExampleOfTheContractIsUnderstood() throws Exception {
    alice.send(ContractExamples.read("update-ranking-draft", "with-unranked"));
    roomForBoth();
    alice.send(ContractExamples.read("update-ranking-draft", "paused"));
    assertThat(roomForBoth().get("live").asBoolean()).isFalse();
    openRoom();

    for (String example :
        List.of(
            "raise-with-comment",
            "raise-with-value",
            "agree-without-comment",
            "clear-comment",
            "withdraw")) {
      bob.send(ContractExamples.read("give-opinion", example));
      roomForBoth();
    }
    alice.send(ContractExamples.read("clear-opinions", "clear"));
    roomForBoth();
    alice.send(ContractExamples.read("set-spotlight", "start"));
    assertThat(roomForBoth().get("spotlightFeatureId").asString()).isEqualTo(F2.toString());
    alice.send(ContractExamples.read("set-spotlight", "end"));
    roomForBoth();
    alice.send(ContractExamples.read("end-ranking", "cancelled"));
    assertThat(roomForBoth().get("endReason").asString()).isEqualTo("CANCELLED");
  }

  @Test
  void anOpinionAndItsCommentReachTheFacilitator() throws Exception {
    openRoom();

    bob.send(ContractExamples.read("give-opinion", "raise-with-comment"));

    JsonNode opinion = room(alice).get("opinions").get(0);
    assertThat(opinion.get("featureId").asString()).isEqualTo(F2.toString());
    assertThat(opinion.get("opinion").asString()).isEqualTo("RAISE");
    assertThat(opinion.get("comment").asString())
        .isEqualTo("Le salon de mars impose la nouvelle recherche.");

    bob.send(ContractExamples.read("give-opinion", "clear-comment"));
    JsonNode cleared = room(alice).get("opinions").get(0);
    assertThat(cleared.has("comment")).isFalse();
    assertThat(cleared.has("value")).isFalse();

    bob.send(ContractExamples.read("give-opinion", "raise-with-value"));
    assertThat(room(alice).get("opinions").get(0).get("value").asInt()).isEqualTo(8);
  }

  @Test
  void aConnectionOpenedDuringARankingGetsTheStateThenTheRoom() throws Exception {
    openRoom();

    WsTestClient late = open();
    late.hello(SessionFixtures.BOB_TOKEN);

    String first = late.next(5_000);
    assertThat(first).contains("\"type\":\"sessionState\"");
    assertThat(room(late).get("active").asBoolean()).isTrue();
  }

  @Test
  void endingTheRankingSendsTheReasonToEveryone() throws Exception {
    openRoom();

    alice.send(ContractExamples.read("end-ranking", "saved"));

    JsonNode ended = room(bob);
    assertThat(ended.get("active").asBoolean()).isFalse();
    assertThat(ended.get("endReason").asString()).isEqualTo("SAVED");
    assertThat(room(alice).size()).isEqualTo(3);

    bob.send(ContractExamples.read("give-opinion", "agree-without-comment"));
    assertThat(error(bob)).isEqualTo("NO_RANKING_IN_PROGRESS");
  }

  @Test
  void theRoomEndsWhenTheFacilitatorLeaves() throws Exception {
    openRoom();

    alice.close();

    assertThat(room(bob).get("endReason").asString()).isEqualTo("FACILITATOR_LEFT");
  }

  @Test
  void refusalsAreErrorsOfTheContract() throws Exception {
    bob.send(ContractExamples.read("update-ranking-draft", "live"));
    assertThat(error(bob)).isEqualTo("FORBIDDEN");

    alice.send(ContractExamples.read("set-spotlight", "start"));
    assertThat(error(alice)).isEqualTo("NO_RANKING_IN_PROGRESS");

    openRoom();
    alice.send(ContractExamples.read("give-opinion", "agree-without-comment"));
    assertThat(error(alice)).isEqualTo("FORBIDDEN");

    bob.send(
        "{\"type\":\"giveOpinion\",\"featureId\":\""
            + UUID.randomUUID()
            + "\",\"criterionKey\":\"bv\",\"opinion\":\"AGREE\"}");
    assertThat(error(bob)).isEqualTo("NOT_IN_RANKING");

    bob.send(
        "{\"type\":\"giveOpinion\",\"featureId\":\""
            + F1
            + "\",\"criterionKey\":\"bv\",\"opinion\":\"QUESTION\"}");
    assertThat(error(bob)).isEqualTo("INVALID_MESSAGE");

    bob.send(
        "{\"type\":\"giveOpinion\",\"featureId\":\""
            + F1
            + "\",\"criterionKey\":\"bv\",\"opinion\":\"RAISE\",\"value\":\"8\"}");
    assertThat(error(bob)).isEqualTo("INVALID_MESSAGE");

    bob.send(
        "{\"type\":\"giveOpinion\",\"featureId\":\""
            + F1
            + "\",\"criterionKey\":\"bv\",\"opinion\":\"RAISE\",\"value\":1000}");
    assertThat(error(bob)).isEqualTo("INVALID_VALUE");

    alice.send("{\"type\":\"updateRankingDraft\",\"live\":true}");
    assertThat(error(alice)).isEqualTo("INVALID_MESSAGE");
  }

  @Test
  void aDraftOfFiftyFeaturesStaysUnderTheMessageLimit() throws Exception {
    List<UUID> ids = new ArrayList<>(List.of(F1, F2, F3));
    for (int i = 4; i <= 50; i++) {
      UUID id = UUID.randomUUID();
      insertFeature(id, "F-" + i);
      ids.add(id);
    }
    String levels =
        ids.stream().map(id -> "[\"" + id + "\"]").collect(Collectors.joining(",", "[", "]"));
    String values =
        ids.stream().map(id -> "\"" + id + "\":10").collect(Collectors.joining(",", "{", "}"));
    String draft =
        "{\"type\":\"updateRankingDraft\",\"live\":true,\"draft\":{\"criterionKeys\":[\"bv\",\"tc\","
            + "\"rrOe\",\"js\"],\"criterionKey\":\"rrOe\",\"levels\":"
            + levels
            + ",\"unranked\":[],\"values\":"
            + values
            + "}}";
    assertThat(draft.getBytes(StandardCharsets.UTF_8).length).isLessThan(16 * 1024);

    alice.send(draft);

    assertThat(room(bob).get("draft").get("levels").size()).isEqualTo(50);
  }
}
