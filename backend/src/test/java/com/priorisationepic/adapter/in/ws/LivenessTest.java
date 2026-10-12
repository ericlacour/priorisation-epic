package com.priorisationepic.adapter.in.ws;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.PostgresTestBase;
import java.net.http.HttpClient;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.socket.CloseStatus;

/**
 * Vivacité des connexions de bout en bout, délais raccourcis : tick, ping de protocole, pong qui
 * garde la connexion vivante, connexion muette fermée.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "priorisation-epic.allowed-origins=https://front.example",
      "priorisation-epic.tick-interval=200ms",
      "priorisation-epic.ping-interval=100ms",
      "priorisation-epic.liveness-timeout=1s"
    })
class LivenessTest extends PostgresTestBase {

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;

  private final HttpClient http = HttpClient.newHttpClient();
  private final List<WsTestClient> opened = new ArrayList<>();

  @BeforeEach
  void seed() {
    SessionFixtures.reset(jdbc);
    SessionFixtures.insertSession(jdbc);
    SessionFixtures.insertParticipant(jdbc, "Bob", SessionFixtures.BOB_TOKEN, "PARTICIPANT");
  }

  @AfterEach
  void closeAll() {
    opened.forEach(c -> c.socket.abort());
  }

  private WsTestClient connect(String token, boolean silent) throws Exception {
    WsTestClient client = WsTestClient.open(http, port, SessionFixtures.SESSION_ID, silent);
    opened.add(client);
    client.hello(token);
    if (silent) {
      client.socket.request(1);
    }
    return client;
  }

  @Test
  void aConnectedClientReceivesTicksAndPings() throws Exception {
    WsTestClient alice = connect(SessionFixtures.ALICE_TOKEN, false);

    assertThat(alice.nextContaining("\"type\":\"tick\"", 3_000)).isNotNull();
    Thread.sleep(500);
    assertThat(alice.pings.get()).isGreaterThanOrEqualTo(3);
  }

  @Test
  void aConnectionThatAnswersPingsStaysConnected() throws Exception {
    WsTestClient alice = connect(SessionFixtures.ALICE_TOKEN, false);
    Thread.sleep(2_500);
    assertThat(alice.closed.get()).isFalse();
  }

  @Test
  void aSilentConnectionIsClosedAndAnActiveOneIsNot() throws Exception {
    WsTestClient alice = connect(SessionFixtures.ALICE_TOKEN, false);
    WsTestClient bob = connect(SessionFixtures.BOB_TOKEN, true);

    Thread.sleep(2_500);

    assertThat(alice.closed.get()).isFalse();
    // Le serveur a fermé le socket muet : Bob relit et reçoit la fermeture.
    bob.socket.request(Long.MAX_VALUE);
    assertThat(bob.closeCode.get(5, TimeUnit.SECONDS)).isEqualTo(CloseStatus.GOING_AWAY.getCode());
  }

  @Test
  void anyMessageCountsAsActivity() throws Exception {
    WsTestClient bob = connect(SessionFixtures.BOB_TOKEN, true);

    for (int i = 0; i < 8; i++) {
      Thread.sleep(250);
      bob.send("{\"type\":\"heartbeat\"}");
    }
    assertThat(bob.closed.get()).isFalse();
  }
}
