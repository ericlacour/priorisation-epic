package com.priorisationepic.adapter.in.rest;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.ContractExamples;
import com.priorisationepic.PostgresTestBase;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class HealthControllerTest extends PostgresTestBase {

  @LocalServerPort int port;

  @Autowired JsonMapper jsonMapper;

  @Test
  void answersTheContractExample() throws Exception {
    HttpResponse<String> response =
        HttpClient.newHttpClient()
            .send(
                HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/health"))
                    .build(),
                HttpResponse.BodyHandlers.ofString());

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(response.headers().firstValue("Content-Type"))
        .hasValueSatisfying(type -> assertThat(type).startsWith("application/json"));
    assertThat(jsonMapper.readTree(response.body()))
        .isEqualTo(jsonMapper.readTree(ContractExamples.read("health-response", "up")));
  }
}
