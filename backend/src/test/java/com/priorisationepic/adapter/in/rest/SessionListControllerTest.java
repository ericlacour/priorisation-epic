package com.priorisationepic.adapter.in.rest;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.ContractSchemas;
import com.priorisationepic.PostgresTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

/** {@code GET /api/sessions} de bout en bout contre PostgreSQL (FR-026). */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "priorisation-epic.max-creations-per-ip=1000")
class SessionListControllerTest extends PostgresTestBase {

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;

  private RestClient rest;

  @BeforeEach
  void setUp() {
    rest = new RestClient(port);
    jdbc.update("delete from session");
  }

  private String create(String name, String pseudo) throws Exception {
    RestClient.Response response =
        rest.post("/api/sessions", "{\"name\":\"" + name + "\",\"pseudo\":\"" + pseudo + "\"}");
    assertThat(response.status()).isEqualTo(201);
    return response.json().get("sessionId").asString();
  }

  private JsonNode list() throws Exception {
    RestClient.Response response = rest.get("/api/sessions");
    assertThat(response.status()).isEqualTo(200);
    assertThat(response.contentType()).startsWith("application/json");
    for (JsonNode line : response.json()) {
      assertThat(ContractSchemas.validate("session-summary", line.toString()))
          .as(line.toString())
          .isEmpty();
    }
    return response.json();
  }

  @Test
  void noSessionGivesAnEmptyList() throws Exception {
    assertThat(list()).isEmpty();
  }

  @Test
  void theSessionsComeNewestFirstWithTheirFacilitatorDateStatusAndMethod() throws Exception {
    String older = create("PI 27", "Éric");
    String newer = create("PI 28", "Camille");
    jdbc.update(
        "update session set created_at = timestamptz '2026-09-30 08:00:00Z', status = 'CLOSED'"
            + " where session_id = ?",
        older);
    jdbc.update(
        "update session set created_at = timestamptz '2026-10-14 13:30:00Z' where session_id = ?",
        newer);

    JsonNode sessions = list();

    assertThat(sessions).hasSize(2);
    JsonNode first = sessions.get(0);
    assertThat(first.get("sessionId").asString()).isEqualTo(newer);
    assertThat(first.get("name").asString()).isEqualTo("PI 28");
    assertThat(first.get("facilitatorPseudo").asString()).isEqualTo("Camille");
    assertThat(first.get("createdAt").asString()).isEqualTo("2026-10-14T13:30:00Z");
    assertThat(first.get("status").asString()).isEqualTo("PREPARATION");
    assertThat(first.get("method").asString()).isEqualTo("WSJF");
    assertThat(first.get("methodVersion").asInt()).isEqualTo(2);
    JsonNode second = sessions.get(1);
    assertThat(second.get("sessionId").asString()).isEqualTo(older);
    assertThat(second.get("status").asString()).isEqualTo("CLOSED");
  }

  @Test
  void theFacilitatorShownIsTheCurrentOne() throws Exception {
    String id = create("PI 28", "Éric");
    jdbc.update(
        "insert into participant (id, session_id, pseudo, role, participant_token_hash,"
            + " joined_at, last_seen_at) values (gen_random_uuid(), ?, 'Camille', 'PARTICIPANT',"
            + " 'x', now(), now())",
        id);
    jdbc.update(
        "update participant set role = case when pseudo = 'Camille' then 'FACILITATOR'"
            + " else 'PARTICIPANT' end where session_id = ?",
        id);

    assertThat(list().get(0).get("facilitatorPseudo").asString()).isEqualTo("Camille");
  }

  @Test
  void theListGivesNoToken() throws Exception {
    create("PI 28", "Éric");

    String body = rest.get("/api/sessions").body();

    assertThat(body).doesNotContain("Token").doesNotContain("token").doesNotContain("hash");
  }
}
