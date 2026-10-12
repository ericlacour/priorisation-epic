package com.priorisationepic.adapter.in.ws;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.PostgresTestBase;
import java.net.http.HttpClient;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

/**
 * Délai du {@code hello} plus court que l'ouverture de la connexion : un délai nul expire avant
 * même la fin de {@code afterConnectionEstablished}. Il doit quand même fermer la connexion en
 * 1008.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "priorisation-epic.allowed-origins=https://front.example",
      "priorisation-epic.hello-timeout=0ms"
    })
class HelloTimeoutTest extends PostgresTestBase {

  /**
   * Plusieurs connexions, pour que le délai expire au moins une fois avant la fin de l'ouverture.
   */
  private static final int CONNECTIONS = 20;

  @LocalServerPort int port;

  private final HttpClient http = HttpClient.newHttpClient();
  private final List<WsTestClient> opened = new ArrayList<>();

  @AfterEach
  void closeAll() {
    opened.forEach(c -> c.socket.abort());
  }

  @Test
  void aTimeoutThatExpiresDuringTheOpeningStillClosesWith1008() throws Exception {
    for (int i = 0; i < CONNECTIONS; i++) {
      opened.add(WsTestClient.open(http, port, SessionFixtures.SESSION_ID, false));
    }
    for (WsTestClient client : opened) {
      assertThat(client.closeCode.get(5, TimeUnit.SECONDS)).isEqualTo(1008);
    }
  }
}
