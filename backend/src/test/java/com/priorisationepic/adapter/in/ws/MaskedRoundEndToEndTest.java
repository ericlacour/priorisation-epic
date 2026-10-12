package com.priorisationepic.adapter.in.ws;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.ContractSchemas;
import com.priorisationepic.PostgresTestBase;
import java.net.http.HttpClient;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
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
 * Tour masqué de bout en bout (T068, SC-004) avec trois connexions : l'animateur, carol et bob.
 * Aucune trame envoyée à bob ne contient une valeur de carol avant la révélation, toutes la
 * contiennent après ; chaque trame est valide contre le contrat.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "priorisation-epic.allowed-origins=https://front.example",
      "priorisation-epic.tick-interval=10m",
      "priorisation-epic.ping-interval=10m"
    })
class MaskedRoundEndToEndTest extends PostgresTestBase {

  /** Les valeurs de carol sur F-1 : aucune autre valeur du test ne vaut 7, 6, 9 ou 8. */
  private static final String CAROL_VOTE = "{\"bv\":7,\"tc\":6,\"rrOe\":9,\"js\":8}";

  private static final Pattern CAROL_VALUES = Pattern.compile("\"(bv|tc|rrOe|js)\":(7|6|9|8)\\b");

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;

  private final HttpClient http = HttpClient.newHttpClient();
  private final List<WsTestClient> opened = new ArrayList<>();
  private WsTestClient facilitator;
  private WsTestClient carol;
  private WsTestClient bob;
  private UUID carolId;
  private UUID bobId;

  @BeforeEach
  void seed() throws Exception {
    SessionFixtures.reset(jdbc);
    SessionFixtures.insertSession(jdbc);
    bobId =
        SessionFixtures.insertParticipant(jdbc, "Bob", SessionFixtures.BOB_TOKEN, "PARTICIPANT");
    carolId =
        SessionFixtures.insertParticipant(
            jdbc, "Carol", "participant-token-of-carol", "PARTICIPANT");
    facilitator = connect(SessionFixtures.ALICE_TOKEN, SessionFixtures.ANIMATION_TOKEN);
    carol = connect("participant-token-of-carol", null);
    bob = connect(SessionFixtures.BOB_TOKEN, null);
    settle();
  }

  @AfterEach
  void closeAll() {
    opened.forEach(c -> c.socket.abort());
  }

  private WsTestClient connect(String token, String animation) throws Exception {
    WsTestClient client = WsTestClient.open(http, port, SessionFixtures.SESSION_ID, false);
    opened.add(client);
    if (animation == null) {
      client.hello(token);
    } else {
      client.hello(token, animation);
    }
    return client;
  }

  /** Toutes les trames reçues jusqu'à un court silence, chacune validée contre le contrat. */
  private List<String> drain(WsTestClient client) throws Exception {
    List<String> frames = new ArrayList<>();
    String frame;
    while ((frame = client.next(400)) != null) {
      frames.add(frame);
      JsonNode node = json.readTree(frame);
      String schema =
          switch (node.get("type").asString()) {
            case "sessionState" -> "session-state.json";
            case "error" -> "error.json";
            case "facilitatorHandover" -> "facilitator-handover.json";
            default -> null;
          };
      if (schema != null) {
        assertThat(ContractSchemas.violations(schema, frame)).as(frame).isEmpty();
      }
    }
    return frames;
  }

  private void settle() throws Exception {
    drain(facilitator);
    drain(carol);
    drain(bob);
  }

  private JsonNode lastState(List<String> frames) throws Exception {
    for (int i = frames.size() - 1; i >= 0; i--) {
      if (frames.get(i).contains("\"type\":\"sessionState\"")) {
        return json.readTree(frames.get(i));
      }
    }
    throw new AssertionError("no sessionState in " + frames);
  }

  private String codeOf(List<String> frames) throws Exception {
    for (String frame : frames) {
      JsonNode node = json.readTree(frame);
      if (node.get("type").asString().equals("error")) {
        return node.get("code").asString();
      }
    }
    return null;
  }

  private UUID addFeature(String externalId) throws Exception {
    facilitator.send(
        "{\"type\":\"addFeature\",\"externalId\":\""
            + externalId
            + "\",\"title\":\"T\",\"criteria\":{\"bv\":2,\"tc\":2,\"rrOe\":2,\"js\":3}}");
    JsonNode state = lastState(drain(facilitator));
    settleOthers();
    for (JsonNode f : state.get("features")) {
      if (f.get("externalId").asString().equals(externalId)) {
        return UUID.fromString(f.get("id").asString());
      }
    }
    throw new AssertionError(externalId);
  }

  private void settleOthers() throws Exception {
    drain(carol);
    drain(bob);
  }

  private UUID openRoundOn(UUID... features) throws Exception {
    StringBuilder ids = new StringBuilder();
    for (UUID id : features) {
      ids.append(ids.isEmpty() ? "" : ",").append('"').append(id).append('"');
    }
    facilitator.send("{\"type\":\"openRound\",\"featureIds\":[" + ids + "]}");
    JsonNode state = lastState(drain(facilitator));
    settleOthers();
    return UUID.fromString(state.get("openRounds").get(0).get("id").asString());
  }

  @Test
  void aRoundCannotOpenBeforeTheSessionStarts() throws Exception {
    UUID f1 = addFeature("F-1");
    facilitator.send("{\"type\":\"openRound\",\"featureIds\":[\"" + f1 + "\"]}");
    assertThat(codeOf(drain(facilitator))).isEqualTo("SESSION_NOT_STARTED");
    assertThat(jdbc.queryForObject("select count(*) from voting_round", Integer.class)).isZero();
  }

  @Test
  void nobodySeesTheVotesOfOthersBeforeTheRevealAndEveryoneDoesAfter() throws Exception {
    UUID f1 = addFeature("F-1");
    UUID f2 = addFeature("F-2");
    facilitator.send("{\"type\":\"changeStatus\",\"action\":\"START\"}");
    assertThat(lastState(drain(facilitator)).get("status").asString()).isEqualTo("IN_PROGRESS");
    settleOthers();
    UUID round = openRoundOn(f1, f2);

    carol.send(
        "{\"type\":\"castVote\",\"roundId\":\""
            + round
            + "\",\"featureId\":\""
            + f1
            + "\",\"criteria\":"
            + CAROL_VOTE
            + "}");
    List<String> carolFrames = drain(carol);
    List<String> bobFrames = drain(bob);
    List<String> facilitatorFrames = drain(facilitator);

    // carol voit son propre vote, personne d'autre (le détecteur de fuite trouve bien ses valeurs).
    assertThat(CAROL_VALUES.matcher(carolFrames.get(carolFrames.size() - 1)).find()).isTrue();
    JsonNode asCarol = lastState(carolFrames);
    assertThat(
            asCarol.get("openRounds").get(0).get("myVotes").get(f1.toString()).get("rrOe").asInt())
        .isEqualTo(9);
    assertThat(asCarol.get("openRounds").get(0).get("results").isNull()).isTrue();
    // bob et l'animateur voient seulement qu'elle a noté une fonctionnalité sur deux.
    for (List<String> frames : List.of(bobFrames, facilitatorFrames)) {
      assertThat(frames).isNotEmpty();
      for (String frame : frames) {
        assertThat(CAROL_VALUES.matcher(frame).find()).as(frame).isFalse();
      }
      JsonNode state = lastState(frames);
      assertThat(state.get("openRounds").get(0).get("myVotes").isEmpty()).isTrue();
      assertThat(progressOf(state, carolId)).isEqualTo(1);
    }
    // bob ne voit ni valeurs ni score des fonctionnalités du tour, l'animateur voit les valeurs
    // retenues.
    JsonNode asBob = lastState(bobFrames);
    for (JsonNode f : asBob.get("features")) {
      assertThat(f.get("votingInProgress").asBoolean()).isTrue();
      assertThat(f.get("criteria").isNull()).isTrue();
      assertThat(f.get("score").isNull()).isTrue();
    }
    JsonNode asFacilitator = lastState(facilitatorFrames);
    assertThat(asFacilitator.get("features").get(0).get("criteria").isNull()).isFalse();

    // l'animateur ne peut pas modifier les critères d'une fonctionnalité en vote (FR-018).
    facilitator.send(
        "{\"type\":\"updateFeature\",\"featureId\":\""
            + f1
            + "\",\"version\":0,\"criteria\":{\"js\":5}}");
    assertThat(codeOf(drain(facilitator))).isEqualTo("FEATURE_IN_OPEN_ROUND");

    facilitator.send("{\"type\":\"revealRound\",\"roundId\":\"" + round + "\"}");
    List<String> afterFacilitator = drain(facilitator);
    List<String> afterBob = drain(bob);
    List<String> afterCarol = drain(carol);
    for (List<String> frames : List.of(afterFacilitator, afterBob, afterCarol)) {
      JsonNode state = lastState(frames);
      assertThat(state.get("openRounds")).isEmpty();
      JsonNode result = state.get("lastRevealedRounds").get(0).get("results").get(0);
      assertThat(result.get("votes").get(0).get("criteria").get("rrOe").asInt()).isEqualTo(9);
      assertThat(result.get("min").get("bv").asInt()).isEqualTo(7);
      assertThat(result.get("nonVoters").toString()).contains(bobId.toString());
      assertThat(state.get("features")).allMatch(f -> !f.get("votingInProgress").asBoolean());
      assertThat(state.get("features")).allMatch(f -> !f.get("criteria").isNull());
    }
  }

  private int progressOf(JsonNode state, UUID participant) {
    for (JsonNode p : state.get("openRounds").get(0).get("progress")) {
      if (p.get("participantId").asString().equals(participant.toString())) {
        return p.get("completedCount").asInt();
      }
    }
    throw new AssertionError(participant);
  }

  @Test
  void aParticipantCannotOpenRevealOrStartButCanVote() throws Exception {
    UUID f1 = addFeature("F-1");
    facilitator.send("{\"type\":\"changeStatus\",\"action\":\"START\"}");
    drain(facilitator);
    settleOthers();
    UUID round = openRoundOn(f1);

    bob.send("{\"type\":\"openRound\",\"featureIds\":[\"" + f1 + "\"]}");
    assertThat(codeOf(drain(bob))).isEqualTo("FORBIDDEN");
    bob.send("{\"type\":\"revealRound\",\"roundId\":\"" + round + "\"}");
    assertThat(codeOf(drain(bob))).isEqualTo("FORBIDDEN");
    bob.send("{\"type\":\"changeStatus\",\"action\":\"START\"}");
    assertThat(codeOf(drain(bob))).isEqualTo("FORBIDDEN");
    bob.send(
        "{\"type\":\"castVote\",\"roundId\":\""
            + round
            + "\",\"featureId\":\""
            + f1
            + "\",\"criteria\":{\"bv\":4}}");
    assertThat(codeOf(drain(bob))).isNull();
    assertThat(jdbc.queryForObject("select count(*) from vote", Integer.class)).isEqualTo(1);
  }

  @Test
  void transferringTheRoleToAnOfflineParticipantIsRefusedThenToAConnectedOneWorks()
      throws Exception {
    UUID dave =
        SessionFixtures.insertParticipant(jdbc, "Dave", "participant-token-of-dave", "PARTICIPANT");
    facilitator.send("{\"type\":\"transferFacilitator\",\"participantId\":\"" + dave + "\"}");
    assertThat(codeOf(drain(facilitator))).isEqualTo("PARTICIPANT_OFFLINE");
    assertThat(
            jdbc.queryForObject(
                "select count(*) from participant where role = 'FACILITATOR'", Integer.class))
        .isEqualTo(1);

    facilitator.send("{\"type\":\"transferFacilitator\",\"participantId\":\"" + carolId + "\"}");
    List<String> carolFrames = drain(carol);
    List<String> bobFrames = drain(bob);
    drain(facilitator);

    assertThat(carolFrames).anyMatch(f -> f.contains("\"type\":\"facilitatorHandover\""));
    assertThat(bobFrames).noneMatch(f -> f.contains("facilitatorHandover"));
    assertThat(lastState(carolFrames).get("me").get("role").asString()).isEqualTo("FACILITATOR");
    assertThat(
            jdbc.queryForObject("select role from participant where id = ?", String.class, carolId))
        .isEqualTo("FACILITATOR");

    // L'ancien animateur n'a plus de droits ; la nouvelle animatrice en a.
    facilitator.send("{\"type\":\"addFeature\",\"externalId\":\"F-9\",\"title\":\"x\"}");
    assertThat(codeOf(drain(facilitator))).isEqualTo("FORBIDDEN");
    carol.send("{\"type\":\"addFeature\",\"externalId\":\"F-9\",\"title\":\"x\"}");
    assertThat(codeOf(drain(carol))).isNull();
    assertThat(jdbc.queryForObject("select count(*) from feature", Integer.class)).isEqualTo(1);

    // L'ancien jeton d'animation ne donne plus de droits à la reconnexion.
    WsTestClient again = connect(SessionFixtures.ALICE_TOKEN, SessionFixtures.ANIMATION_TOKEN);
    assertThat(codeOf(drain(again))).isEqualTo("FORBIDDEN");
  }
}
