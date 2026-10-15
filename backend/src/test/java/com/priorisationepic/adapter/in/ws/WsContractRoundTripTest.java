package com.priorisationepic.adapter.in.ws;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.ContractExamples;
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
 * Aller-retour du contrat WebSocket : les exemples de messages du contrat sont compris par le
 * serveur (jamais {@code INVALID_MESSAGE}), et ce que le serveur envoie leur est conforme.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "priorisation-epic.allowed-origins=https://front.example",
      "priorisation-epic.tick-interval=10m",
      "priorisation-epic.ping-interval=10m"
    })
class WsContractRoundTripTest extends PostgresTestBase {

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;

  private final HttpClient http = HttpClient.newHttpClient();
  private final JsonMapper json = new JsonMapper();
  private final List<WsTestClient> opened = new ArrayList<>();
  private WsTestClient facilitator;
  private WsTestClient participant;

  @BeforeEach
  void connect() throws Exception {
    SessionFixtures.reset(jdbc);
    SessionFixtures.insertSession(jdbc);
    SessionFixtures.insertParticipant(jdbc, "Bob", SessionFixtures.BOB_TOKEN, "PARTICIPANT");
    facilitator = open();
    facilitator.hello(SessionFixtures.ALICE_TOKEN, SessionFixtures.ANIMATION_TOKEN);
    participant = open();
    participant.hello(SessionFixtures.BOB_TOKEN);
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

  private JsonNode next(WsTestClient client, String type) throws Exception {
    String text = client.nextContaining("\"type\":\"" + type + "\"", 5_000);
    assertThat(text).as(type).isNotNull();
    return json.readTree(text);
  }

  @Test
  void everySessionStateSentIsValidForTheFacilitatorAndTheParticipant() throws Exception {
    facilitator.send(ContractExamples.read("add-feature", "with-values"));
    facilitator.send(ContractExamples.read("add-feature", "title-only"));

    for (WsTestClient client : List.of(facilitator, participant)) {
      String last = null;
      String text;
      while ((text = client.nextContaining("\"type\":\"sessionState\"", 1_500)) != null) {
        assertThat(ContractSchemas.validate("session-state", text)).as(text).isEmpty();
        last = text;
      }
      assertThat(last).isNotNull();
      JsonNode state = json.readTree(last);
      assertThat(state.get("features")).hasSize(2);
      assertThat(state.get("me").get("participantId").asString()).isNotBlank();
    }
  }

  @Test
  void theClientMessageExamplesOfTheContractAreUnderstood() throws Exception {
    String[][] examples = {
      {"add-feature", "with-values"},
      {"add-feature", "title-only"},
      {"update-feature", "values"},
      {"update-feature", "title-and-description"},
      {"update-feature", "mark-for-review"},
      {"delete-feature", "delete"},
      {"update-settings", "rename"},
      {"update-settings", "fibonacci"},
      {"update-settings", "confirmed-scale-change"}
    };
    for (String[] example : examples) {
      facilitator.send(ContractExamples.read(example[0], example[1]));
    }

    int answers = 0;
    String text;
    while ((text = facilitator.next(1_500)) != null) {
      JsonNode message = json.readTree(text);
      if (message.get("type").asString().equals("error")) {
        assertThat(ContractSchemas.validate("error", text)).as(text).isEmpty();
        // Les identifiants des exemples n'existent pas : version périmée ; le JS 4 de F-1 sort de
        // Fibonacci 13 : SCALE_IMPACT. Jamais message invalide.
        assertThat(message.get("code").asString()).as(text).isNotEqualTo("INVALID_MESSAGE");
        answers++;
      }
    }
    assertThat(answers).isEqualTo(5);
  }

  @Test
  void anErrorSentIsValidAgainstTheContract() throws Exception {
    participant.send(ContractExamples.read("add-feature", "title-only"));

    String text = participant.nextContaining("\"type\":\"error\"", 5_000);

    assertThat(ContractSchemas.validate("error", text)).isEmpty();
    assertThat(json.readTree(text).get("code").asString()).isEqualTo("FORBIDDEN");
  }

  @Test
  void theHelloExamplesOfTheContractOpenTheConversation() throws Exception {
    WsTestClient viaExample = open();
    String hello = ContractExamples.read("hello", "participant").replace("PARTICIPANT_TOKEN", "x");
    assertThat(ContractSchemas.validate("hello", hello)).isEmpty();
    viaExample.hello(SessionFixtures.BOB_TOKEN);

    assertThat(next(viaExample, "sessionState").get("me").get("role").asString())
        .isEqualTo("PARTICIPANT");
  }
}
