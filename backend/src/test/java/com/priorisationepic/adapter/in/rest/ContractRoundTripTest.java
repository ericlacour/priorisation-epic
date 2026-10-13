package com.priorisationepic.adapter.in.rest;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.ContractSchemas;
import com.priorisationepic.PostgresTestBase;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

/**
 * Toute réponse REST du parcours est valide contre {@code contract/schemas/}, avec des
 * fonctionnalités complètes, incomplètes et hors échelle (aller-retour du contrat).
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "priorisation-epic.max-creations-per-ip=1000")
class ContractRoundTripTest extends PostgresTestBase {

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;

  private RestClient rest;
  private String sessionId;

  @BeforeEach
  void setUp() throws Exception {
    rest = new RestClient(port);
    jdbc.update("delete from session");
    sessionId =
        rest.post(
                "/api/sessions",
                "{\"name\":\"Atelier\",\"pseudo\":\"Éric\",\"scale\":{\"type\":\"CONTINUOUS\",\"max\":10}}")
            .json()
            .get("sessionId")
            .asString();
  }

  private void feature(String externalId, Integer bv, Integer tc, Integer rrOe, Integer js) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "insert into feature (id, session_id, external_id, title) values (?, ?, ?, ?)",
        id,
        sessionId,
        externalId,
        "Titre " + externalId);
    value(id, "bv", bv);
    value(id, "tc", tc);
    value(id, "rrOe", rrOe);
    value(id, "js", js);
  }

  private void value(UUID feature, String key, Integer value) {
    if (value != null) {
      jdbc.update(
          "insert into feature_criterion_value (feature_id, criterion_key, value) values (?, ?, ?)",
          feature,
          key,
          value);
    }
  }

  @Test
  void aSessionWithCompleteIncompleteAndOutOfScaleFeaturesIsValidAndSorted() throws Exception {
    feature("F-1", 8, 5, 3, 4);
    feature("F-2", 2, 2, 2, 3);
    feature("F-3", 9, null, null, null);
    feature("F-4", 20, 1, 1, 1);

    RestClient.Response response = rest.get("/api/sessions/" + sessionId);

    assertThat(ContractSchemas.validate("session-state", response.body())).isEmpty();
    JsonNode features = response.json().get("features");
    assertThat(features).hasSize(4);
    assertThat(features.get(0).get("externalId").asString()).isEqualTo("F-1");
    assertThat(features.get(0).get("score").get("explanation").asString())
        .isEqualTo("CoD = 8 + 5 + 3 = 16 ; WSJF = 16 / 4 = 4,00");
    assertThat(features.get(0).get("score").get("computed").get("wsjf").get("display").asString())
        .isEqualTo("4,00");
    assertThat(features.get(1).get("externalId").asString()).isEqualTo("F-2");
    assertThat(features.get(1).get("score").get("computed").get("wsjf").get("display").asString())
        .isEqualTo("2,00");
    assertThat(features.get(2).get("externalId").asString()).isEqualTo("F-3");
    assertThat(features.get(2).get("score").get("complete").asBoolean()).isFalse();
    assertThat(features.get(2).get("score").get("computed").isNull()).isTrue();
    assertThat(features.get(3).get("externalId").asString()).isEqualTo("F-4");
    assertThat(features.get(3).get("score").get("outOfScale").get(0).asString()).isEqualTo("bv");
    for (int rank = 0; rank < 4; rank++) {
      assertThat(features.get(rank).get("score").get("rank").asInt()).isEqualTo(rank + 1);
    }
  }

  @Test
  void anEmptySessionIsValid() throws Exception {
    assertThat(
            ContractSchemas.validate(
                "session-state", rest.get("/api/sessions/" + sessionId).body()))
        .isEmpty();
  }

  @Test
  void theCreationAndJoinResponsesAreValid() throws Exception {
    RestClient.Response created =
        rest.post("/api/sessions", "{\"name\":\"Autre\",\"pseudo\":\"Zoé\",\"method\":\"WSJF\"}");
    RestClient.Response joined =
        rest.post("/api/sessions/" + sessionId + "/participants", "{\"pseudo\":\"Camille\"}");

    assertThat(ContractSchemas.validate("create-session-response", created.body())).isEmpty();
    assertThat(ContractSchemas.validate("join-session-response", joined.body())).isEmpty();
  }

  @Test
  void everyErrorResponseIsAProblemOfTheContract() throws Exception {
    String join = "/api/sessions/" + sessionId + "/participants";
    String[] bodies = {
      rest.post("/api/sessions", "{oops").body(),
      rest.post("/api/sessions", "{\"name\":\"A\",\"pseudo\":\"\"}").body(),
      rest.post("/api/sessions", "{\"name\":\"A\",\"pseudo\":\"É\",\"method\":\"X\"}").body(),
      rest.post(join, "{\"pseudo\":\"Éric\"}").body(),
      rest.post("/api/sessions/" + "A".repeat(22) + "/participants", "{\"pseudo\":\"É\"}").body(),
      rest.get("/api/sessions/" + "A".repeat(22)).body()
    };
    for (String body : bodies) {
      assertThat(ContractSchemas.validate("problem", body)).as(body).isEmpty();
    }
  }
}
