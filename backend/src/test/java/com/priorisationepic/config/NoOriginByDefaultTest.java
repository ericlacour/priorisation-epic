package com.priorisationepic.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.PostgresTestBase;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Sans ALLOWED_ORIGINS, aucune origine n'est acceptée. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class NoOriginByDefaultTest extends PostgresTestBase {

  @LocalServerPort int port;

  @Test
  void rejectsEveryOriginWhenNoneIsConfigured() throws Exception {
    HttpRequest request =
        HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/health"))
            .method("OPTIONS", HttpRequest.BodyPublishers.noBody())
            .header("Origin", "http://localhost:4200")
            .header("Access-Control-Request-Method", "GET")
            .build();
    HttpResponse<String> response =
        HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
    assertThat(response.statusCode()).isEqualTo(403);
  }
}
