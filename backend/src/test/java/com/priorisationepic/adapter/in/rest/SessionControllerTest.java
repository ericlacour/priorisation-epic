package com.priorisationepic.adapter.in.rest;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.ContractSchemas;
import com.priorisationepic.PostgresTestBase;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Contrat REST de la création, de l'arrivée et de la consultation (T041) : réponses validées contre
 * {@code contract/schemas}.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "priorisation-epic.max-creations-per-ip=1000")
class SessionControllerTest extends PostgresTestBase {

  private static final String UNKNOWN_SESSION = "AAAAAAAAAAAAAAAAAAAAAA";

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  private final HttpClient http = HttpClient.newHttpClient();

  @BeforeEach
  void clean() {
    jdbc.update("delete from session");
  }

  private HttpResponse<String> get(String path) throws Exception {
    return http.send(
        HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET().build(),
        HttpResponse.BodyHandlers.ofString());
  }

  private HttpResponse<String> post(String path, String body) throws Exception {
    return http.send(
        HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build(),
        HttpResponse.BodyHandlers.ofString());
  }

  private JsonNode created(String body) throws Exception {
    HttpResponse<String> response = post("/api/sessions", body);
    assertThat(response.statusCode()).isEqualTo(201);
    assertThat(ContractSchemas.violations("create-session-response.json", response.body()))
        .isEmpty();
    return json.readTree(response.body());
  }

  private void assertProblem(HttpResponse<String> response, int status) {
    assertThat(response.statusCode()).isEqualTo(status);
    assertThat(response.headers().firstValue("Content-Type").orElse(""))
        .startsWith("application/problem+json");
    assertThat(ContractSchemas.violations("problem.json", response.body())).isEmpty();
  }

  @Test
  void listsTheMethodsInTheirLatestVersion() throws Exception {
    HttpResponse<String> response = get("/api/methods");
    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(ContractSchemas.violations("method-list.json", response.body())).isEmpty();
    JsonNode methods = json.readTree(response.body());
    assertThat(methods).hasSize(1);
    assertThat(methods.get(0).get("key").asString()).isEqualTo("WSJF");
    assertThat(methods.get(0).get("version").asInt()).isEqualTo(1);
    assertThat(methods.get(0).get("criteria")).hasSize(4);
    assertThat(methods.get(0).get("computedValues")).hasSize(2);
  }

  @Test
  void createsASessionWithWsjfByDefaultAndTheCreatorIsFacilitator() throws Exception {
    JsonNode created = created("{\"name\":\"PI 27\",\"pseudo\":\"eric\"}");

    HttpResponse<String> state = get("/api/sessions/" + created.get("sessionId").asString());
    assertThat(state.statusCode()).isEqualTo(200);
    assertThat(ContractSchemas.violations("session-state.json", state.body())).isEmpty();
    JsonNode body = json.readTree(state.body());
    assertThat(body.get("method").asString()).isEqualTo("WSJF");
    assertThat(body.get("methodVersion").asInt()).isEqualTo(1);
    assertThat(body.get("status").asString()).isEqualTo("PREPARATION");
    assertThat(body.get("me").isNull()).isTrue();
    assertThat(body.get("scale").get("max").asInt()).isEqualTo(10);
    assertThat(body.get("scale").get("allowedValues")).hasSize(10);
    assertThat(body.get("participants")).hasSize(1);
    assertThat(body.get("participants").get(0).get("role").asString()).isEqualTo("FACILITATOR");
    assertThat(body.get("participants").get(0).get("online").asBoolean()).isFalse();
    assertThat(body.get("features")).isEmpty();
  }

  @Test
  void storesOnlyTheHashesOfTheTokensAndFreezesTheMethodVersion() throws Exception {
    JsonNode created =
        created(
            "{\"name\":\"PI 27\",\"pseudo\":\"eric\",\"method\":\"WSJF\",\"scale\":{\"type\":\"CONTINUOUS\",\"max\":5}}");
    String id = created.get("sessionId").asString();
    assertThat(
            jdbc.queryForObject(
                "select method_version from session where session_id = ?", Integer.class, id))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "select scale_max from session where session_id = ?", Integer.class, id))
        .isEqualTo(5);
    String participantHash =
        jdbc.queryForObject(
            "select participant_token_hash from participant where session_id = ?",
            String.class,
            id);
    String animationHash =
        jdbc.queryForObject(
            "select animation_token_hash from session where session_id = ?", String.class, id);
    assertThat(participantHash).isNotEqualTo(created.get("participantToken").asString());
    assertThat(animationHash).isNotEqualTo(created.get("animationToken").asString());
  }

  @Test
  void refusesInvalidCreationRequestsWithAProblem() throws Exception {
    String[] bodies = {
      "{\"name\":\"PI\",\"pseudo\":\"eric\",\"method\":\"NOPE\"}",
      "{\"name\":\"\",\"pseudo\":\"eric\"}",
      "{\"name\":\"PI\",\"pseudo\":\"\"}",
      "{\"name\":\"PI\",\"pseudo\":\"" + "x".repeat(41) + "\"}",
      "{\"name\":\"PI\"}",
      "{\"pseudo\":\"eric\"}",
      "{\"name\":\"PI\",\"pseudo\":\"eric\",\"extra\":1}",
      "{\"name\":\"PI\",\"pseudo\":\"eric\",\"scale\":{\"type\":\"FIBONACCI\",\"max\":13}}",
      "{\"name\":\"PI\",\"pseudo\":\"eric\",\"scale\":{\"type\":\"CONTINUOUS\",\"max\":1}}",
      "not json"
    };
    for (String body : bodies) {
      HttpResponse<String> response = post("/api/sessions", body);
      assertProblem(response, 400);
    }
    assertThat(jdbc.queryForObject("select count(*) from session", Integer.class)).isZero();
  }

  @Test
  void anUnknownMethodNamesTheFieldInTheProblem() throws Exception {
    HttpResponse<String> response =
        post("/api/sessions", "{\"name\":\"PI\",\"pseudo\":\"eric\",\"method\":\"NOPE\"}");
    assertProblem(response, 400);
    assertThat(json.readTree(response.body()).get("errors").get(0).get("field").asString())
        .isEqualTo("method");
  }

  @Test
  void aParticipantJoinsAndAPseudoTakenIsRefusedIgnoringCase() throws Exception {
    String id = created("{\"name\":\"PI\",\"pseudo\":\"eric\"}").get("sessionId").asString();

    HttpResponse<String> joined =
        post(
            "/api/sessions/" + id + "/participants",
            "{\"pseudo\":\"Alice\",\"businessRole\":\"Tech Lead\"}");
    assertThat(joined.statusCode()).isEqualTo(201);
    assertThat(ContractSchemas.violations("join-session-response.json", joined.body())).isEmpty();

    assertProblem(post("/api/sessions/" + id + "/participants", "{\"pseudo\":\"ALICE\"}"), 409);
    assertProblem(post("/api/sessions/" + id + "/participants", "{\"pseudo\":\"ERIC\"}"), 409);

    JsonNode participants = json.readTree(get("/api/sessions/" + id).body()).get("participants");
    assertThat(participants).hasSize(2);
    assertThat(participants.get(1).get("businessRole").asString()).isEqualTo("Tech Lead");
    assertThat(participants.get(1).get("role").asString()).isEqualTo("PARTICIPANT");
  }

  @Test
  void refusesInvalidJoinRequests() throws Exception {
    String id = created("{\"name\":\"PI\",\"pseudo\":\"eric\"}").get("sessionId").asString();
    for (String body :
        new String[] {
          "{}",
          "{\"pseudo\":\"\"}",
          "{\"pseudo\":\"alice\",\"businessRole\":\"" + "r".repeat(41) + "\"}",
          "{\"pseudo\":\"alice\",\"other\":true}"
        }) {
      assertProblem(post("/api/sessions/" + id + "/participants", body), 400);
    }
  }

  @Test
  void unknownOrMalformedSessionIdsGive404() throws Exception {
    assertProblem(get("/api/sessions/" + UNKNOWN_SESSION), 404);
    assertProblem(get("/api/sessions/short"), 404);
    assertProblem(
        post("/api/sessions/" + UNKNOWN_SESSION + "/participants", "{\"pseudo\":\"alice\"}"), 404);
    assertProblem(post("/api/sessions/short/participants", "{\"pseudo\":\"alice\"}"), 404);
  }
}
