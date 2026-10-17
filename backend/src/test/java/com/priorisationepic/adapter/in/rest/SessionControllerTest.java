package com.priorisationepic.adapter.in.rest;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.ContractExamples;
import com.priorisationepic.ContractSchemas;
import com.priorisationepic.PostgresTestBase;
import com.priorisationepic.domain.Tokens;
import com.priorisationepic.domain.method.MethodRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Création, arrivée et consultation d'une session, et méthodes proposées, de bout en bout contre
 * PostgreSQL. Les erreurs sont celles des exemples du contrat.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "priorisation-epic.max-creations-per-ip=1000")
class SessionControllerTest extends PostgresTestBase {

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;

  private final JsonMapper json = new JsonMapper();
  private RestClient rest;

  @BeforeEach
  void setUp() {
    rest = new RestClient(port);
    jdbc.update("delete from session");
  }

  private JsonNode problemExample(String name, String instance) throws Exception {
    ObjectNode node = (ObjectNode) json.readTree(ContractExamples.read("problem", name));
    node.put("instance", instance);
    return node;
  }

  private JsonNode createSession() throws Exception {
    RestClient.Response response =
        rest.post("/api/sessions", "{\"name\":\"Atelier Q4\",\"pseudo\":\"Éric\"}");
    assertThat(response.status()).isEqualTo(201);
    return response.json();
  }

  // --- GET /api/methods -----------------------------------------------------------------------

  @Test
  void methodsListsWsjfVersion2Alone() throws Exception {
    RestClient.Response response = rest.get("/api/methods");

    assertThat(response.status()).isEqualTo(200);
    assertThat(ContractSchemas.validate("method-list", response.body())).isEmpty();
    JsonNode methods = response.json();
    assertThat(methods).hasSize(1);
    assertThat(methods.get(0).get("key").asString()).isEqualTo("WSJF");
    assertThat(methods.get(0).get("version").asInt()).isEqualTo(2);
    assertThat(methods.get(0).get("criteria")).hasSize(4);
    assertThat(methods.get(0).get("computedValues")).hasSize(2);
    assertThat(methods.get(0))
        .isEqualTo(json.readTree(ContractExamples.read("method-definition", "wsjf-v2")));
  }

  // --- POST /api/sessions ---------------------------------------------------------------------

  @Test
  void creatingASessionUsesWsjfByDefaultAndMakesTheCreatorFacilitator() throws Exception {
    RestClient.Response response =
        rest.post("/api/sessions", "{\"name\":\"Atelier Q4\",\"pseudo\":\"  Éric \"}");

    assertThat(response.status()).isEqualTo(201);
    assertThat(response.contentType()).startsWith("application/json");
    assertThat(ContractSchemas.validate("create-session-response", response.body())).isEmpty();
    JsonNode created = response.json();
    String sessionId = created.get("sessionId").asString();
    assertThat(sessionId).hasSize(22);
    assertThat(
            jdbc.queryForMap(
                "select status, method, method_version, scale_type, scale_max, name from session"
                    + " where session_id = ?",
                sessionId))
        .containsEntry("status", "PREPARATION")
        .containsEntry("method", "WSJF")
        .containsEntry("method_version", 2)
        .containsEntry("scale_type", "CONTINUOUS")
        .containsEntry("scale_max", 10)
        .containsEntry("name", "Atelier Q4");
    assertThat(
            jdbc.queryForMap(
                "select pseudo, role, participant_token_hash from participant where session_id = ?",
                sessionId))
        .containsEntry("pseudo", "Éric")
        .containsEntry("role", "FACILITATOR")
        .containsEntry(
            "participant_token_hash", Tokens.hash(created.get("participantToken").asString()));
    assertThat(
            jdbc.queryForObject(
                "select animation_token_hash from session where session_id = ?",
                String.class,
                sessionId))
        .isEqualTo(Tokens.hash(created.get("animationToken").asString()));
  }

  @Test
  void anExplicitMethodAndScaleAreAccepted() throws Exception {
    RestClient.Response response =
        rest.post(
            "/api/sessions", ContractExamples.read("create-session-request", "explicit-method"));

    assertThat(response.status()).isEqualTo(201);
    assertThat(
            jdbc.queryForObject(
                "select method from session where session_id = ?",
                String.class,
                response.json().get("sessionId").asString()))
        .isEqualTo("WSJF");
  }

  @Test
  void theContractExamplesOfTheRequestAreAccepted() throws Exception {
    assertThat(
            rest.post("/api/sessions", ContractExamples.read("create-session-request", "minimal"))
                .status())
        .isEqualTo(201);
  }

  @Test
  void aNameAlreadyTakenIsRefusedWith409AndTheProblemOfTheContract() throws Exception {
    createSession();

    RestClient.Response response =
        rest.post("/api/sessions", "{\"name\":\"  atelier q4 \",\"pseudo\":\"Camille\"}");

    assertThat(response.status()).isEqualTo(409);
    assertThat(response.json()).isEqualTo(problemExample("session-name-taken", "/api/sessions"));
    assertThat(jdbc.queryForObject("select count(*) from session", Integer.class)).isOne();
  }

  @Test
  void anUnknownMethodIsRefusedWith400() throws Exception {
    RestClient.Response response =
        rest.post("/api/sessions", "{\"name\":\"A\",\"pseudo\":\"Éric\",\"method\":\"RICE\"}");

    assertThat(response.status()).isEqualTo(400);
    assertThat(response.contentType()).startsWith("application/problem+json");
    assertThat(ContractSchemas.validate("problem", response.body())).isEmpty();
    assertThat(response.json().get("errors").get(0).get("field").asString()).isEqualTo("method");
    assertThat(jdbc.queryForObject("select count(*) from session", Integer.class)).isZero();
  }

  @Test
  void aBlankPseudoGivesTheInvalidPseudoProblemOfTheContract() throws Exception {
    RestClient.Response response = rest.post("/api/sessions", "{\"name\":\"A\",\"pseudo\":\"  \"}");

    assertThat(response.status()).isEqualTo(400);
    assertThat(response.json())
        .isEqualTo(problemExample("bad-request-invalid-pseudo", "/api/sessions"));
  }

  @Test
  void invalidNamesAndScalesAreRefusedWith400() throws Exception {
    for (String body :
        new String[] {
          "{\"pseudo\":\"Éric\"}",
          "{\"name\":\"\",\"pseudo\":\"Éric\"}",
          "{\"name\":\"" + "x".repeat(121) + "\",\"pseudo\":\"Éric\"}",
          "{\"name\":\"A\",\"pseudo\":\"" + "x".repeat(41) + "\"}",
          "{\"name\":\"A\",\"pseudo\":\"Éric\",\"scale\":{\"type\":\"CONTINUOUS\",\"max\":1}}",
          "{\"name\":\"A\",\"pseudo\":\"Éric\",\"scale\":{\"type\":\"CONTINUOUS\",\"max\":101}}",
          "{\"name\":\"A\",\"pseudo\":\"Éric\",\"scale\":{\"type\":\"CONTINUOUS\"}}",
          "{\"name\":\"A\",\"pseudo\":\"Éric\",\"scale\":{\"type\":\"TEAPOT\",\"max\":10}}"
        }) {
      RestClient.Response response = rest.post("/api/sessions", body);
      assertThat(response.status()).as(body).isEqualTo(400);
      assertThat(response.contentType()).as(body).startsWith("application/problem+json");
      assertThat(ContractSchemas.validate("problem", response.body())).as(body).isEmpty();
    }
    assertThat(jdbc.queryForObject("select count(*) from session", Integer.class)).isZero();
  }

  @Test
  void aFieldOutsideTheContractIsRefused() throws Exception {
    RestClient.Response response =
        rest.post("/api/sessions", "{\"name\":\"A\",\"pseudo\":\"Éric\",\"admin\":true}");

    assertThat(response.status()).isEqualTo(400);
  }

  // --- POST /api/sessions/{sessionId}/participants --------------------------------------------

  @Test
  void joiningGivesAParticipantTokenAndTheParticipantAppearsInTheSession() throws Exception {
    String sessionId = createSession().get("sessionId").asString();

    RestClient.Response response =
        rest.post(
            "/api/sessions/" + sessionId + "/participants",
            "{\"pseudo\":\"Camille\",\"businessRole\":\"Product Owner\"}");

    assertThat(response.status()).isEqualTo(201);
    assertThat(ContractSchemas.validate("join-session-response", response.body())).isEmpty();
    assertThat(
            jdbc.queryForMap(
                "select role, business_role, participant_token_hash from participant"
                    + " where session_id = ? and pseudo = 'Camille'",
                sessionId))
        .containsEntry("role", "PARTICIPANT")
        .containsEntry("business_role", "Product Owner")
        .containsEntry(
            "participant_token_hash",
            Tokens.hash(response.json().get("participantToken").asString()));
  }

  @Test
  void aPseudoAlreadyUsedGivesTheConflictProblemOfTheContract() throws Exception {
    String sessionId = createSession().get("sessionId").asString();
    String path = "/api/sessions/" + sessionId + "/participants";

    RestClient.Response same = rest.post(path, "{\"pseudo\":\"Éric\"}");
    RestClient.Response otherCase = rest.post(path, "{\"pseudo\":\"ÉRIC\"}");

    assertThat(same.status()).isEqualTo(409);
    assertThat(same.contentType()).startsWith("application/problem+json");
    assertThat(same.json()).isEqualTo(problemExample("pseudo-taken", path));
    assertThat(otherCase.status()).isEqualTo(409);
    assertThat(jdbc.queryForObject("select count(*) from participant", Integer.class)).isEqualTo(1);
  }

  @Test
  void aPseudoIsTakenOverAfterTenMinutesOfAbsenceAndTheOldTokenStopsWorking() throws Exception {
    JsonNode created = createSession();
    String sessionId = created.get("sessionId").asString();
    String path = "/api/sessions/" + sessionId + "/participants";
    String first =
        rest.post(path, "{\"pseudo\":\"Camille\"}").json().get("participantToken").asString();
    jdbc.update(
        "update participant set last_seen_at = now() - interval '11 minutes'"
            + " where session_id = ? and pseudo = 'Camille'",
        sessionId);

    RestClient.Response second = rest.post(path, "{\"pseudo\":\"camille\"}");

    assertThat(second.status()).isEqualTo(201);
    assertThat(jdbc.queryForObject("select count(*) from participant", Integer.class)).isEqualTo(2);
    assertThat(
            jdbc.queryForObject(
                "select participant_token_hash from participant where pseudo = 'Camille'",
                String.class))
        .isEqualTo(Tokens.hash(second.json().get("participantToken").asString()))
        .isNotEqualTo(Tokens.hash(first));
  }

  @Test
  void theFacilitatorPseudoIsNeverTakenOver() throws Exception {
    JsonNode created = createSession();
    String sessionId = created.get("sessionId").asString();
    jdbc.update(
        "update participant set last_seen_at = now() - interval '1 day' where session_id = ?",
        sessionId);

    RestClient.Response response =
        rest.post("/api/sessions/" + sessionId + "/participants", "{\"pseudo\":\"Éric\"}");

    assertThat(response.status()).isEqualTo(409);
  }

  @Test
  void joiningAnUnknownOrMalformedSessionGivesTheNotFoundProblemOfTheContract() throws Exception {
    for (String id : new String[] {"A".repeat(22), "not-a-session"}) {
      String path = "/api/sessions/" + id + "/participants";
      RestClient.Response response = rest.post(path, "{\"pseudo\":\"Camille\"}");

      assertThat(response.status()).as(id).isEqualTo(404);
      assertThat(response.json()).as(id).isEqualTo(problemExample("session-not-found", path));
    }
  }

  @Test
  void joiningWithAnInvalidPseudoIsRefusedWith400() throws Exception {
    String sessionId = createSession().get("sessionId").asString();
    String path = "/api/sessions/" + sessionId + "/participants";

    assertThat(rest.post(path, "{\"pseudo\":\"\"}").status()).isEqualTo(400);
    assertThat(rest.post(path, "{}").status()).isEqualTo(400);
    assertThat(rest.post(path, "{\"pseudo\":\"" + "x".repeat(41) + "\"}").status()).isEqualTo(400);
    assertThat(
            rest.post(path, "{\"pseudo\":\"Camille\",\"businessRole\":\"" + "x".repeat(41) + "\"}")
                .status())
        .isEqualTo(400);
  }

  // --- GET /api/sessions/{sessionId} ----------------------------------------------------------

  @Test
  void readingASessionGivesTheReadOnlyViewOfAParticipant() throws Exception {
    String sessionId = createSession().get("sessionId").asString();

    RestClient.Response response = rest.get("/api/sessions/" + sessionId);

    assertThat(response.status()).isEqualTo(200);
    assertThat(ContractSchemas.validate("session-state", response.body())).isEmpty();
    JsonNode state = response.json();
    assertThat(state.get("type").asString()).isEqualTo("sessionState");
    assertThat(state.get("name").asString()).isEqualTo("Atelier Q4");
    assertThat(state.get("status").asString()).isEqualTo("PREPARATION");
    assertThat(state.get("method").asString()).isEqualTo("WSJF");
    assertThat(state.get("methodVersion").asInt()).isEqualTo(2);
    assertThat(state.get("me").isNull()).isTrue();
    assertThat(state.get("features")).isEmpty();
    assertThat(state.get("scale").get("allowedValues")).hasSize(10);
    assertThat(state.get("participants")).hasSize(1);
    assertThat(state.get("participants").get(0).get("pseudo").asString()).isEqualTo("Éric");
    assertThat(state.get("participants").get(0).get("online").asBoolean()).isFalse();
    assertThat(state.get("formula").asString())
        .isEqualTo(MethodRegistry.standard().defaultMethod().definition().formula());
    assertThat(response.body()).doesNotContain("Token");
  }

  @Test
  void readingAnUnknownSessionGivesTheNotFoundProblem() throws Exception {
    for (String id : new String[] {"A".repeat(22), "nope"}) {
      String path = "/api/sessions/" + id;
      RestClient.Response response = rest.get(path);

      assertThat(response.status()).as(id).isEqualTo(404);
      assertThat(response.json()).as(id).isEqualTo(problemExample("session-not-found", path));
    }
  }
}
