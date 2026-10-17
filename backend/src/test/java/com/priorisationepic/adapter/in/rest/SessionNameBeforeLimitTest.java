package com.priorisationepic.adapter.in.rest;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.PostgresTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Un nom déjà pris est refusé en 409 avant de compter dans la limite de créations par adresse :
 * l'utilisateur à la limite apprend que le nom est pris, pas qu'il a trop créé (FR-001a).
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "priorisation-epic.max-creations-per-ip=1")
class SessionNameBeforeLimitTest extends PostgresTestBase {

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;

  @BeforeEach
  void reset() {
    jdbc.update("delete from session");
  }

  @Test
  void aTakenNameGets409EvenAtTheCreationLimit() throws Exception {
    RestClient rest = new RestClient(port);
    assertThat(
            rest.post("/api/sessions", "{\"name\":\"PI26T7_TEST\",\"pseudo\":\"Éric\"}").status())
        .isEqualTo(201);

    assertThat(
            rest.post("/api/sessions", "{\"name\":\"pi26t7_test\",\"pseudo\":\"Éric\"}").status())
        .isEqualTo(409);
    // Le refus n'a pas consommé de création : la limite seule refuse ensuite un nom libre.
    assertThat(rest.post("/api/sessions", "{\"name\":\"Roadmap\",\"pseudo\":\"Éric\"}").status())
        .isEqualTo(429);
  }
}
