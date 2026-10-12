package com.priorisationepic.adapter.in.ws;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.PostgresTestBase;
import java.net.http.HttpClient;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;

/** Poignée de main {@code hello} et messages du canal, de bout en bout contre PostgreSQL. */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "priorisation-epic.allowed-origins=https://front.example",
      "priorisation-epic.hello-timeout=1500ms",
      "priorisation-epic.tick-interval=10m",
      "priorisation-epic.ping-interval=10m"
    })
class SessionSocketHandlerTest extends PostgresTestBase {

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;

  private final HttpClient http = HttpClient.newHttpClient();
  private final List<WsTestClient> opened = new ArrayList<>();

  @BeforeEach
  void seed() {
    SessionFixtures.reset(jdbc);
    SessionFixtures.insertSession(jdbc);
  }

  @AfterEach
  void closeAll() {
    opened.forEach(c -> c.socket.abort());
  }

  private WsTestClient open(String sessionId) throws Exception {
    WsTestClient client = WsTestClient.open(http, port, sessionId, false);
    opened.add(client);
    return client;
  }

  private int closeCodeOf(WsTestClient client) throws Exception {
    return client.closeCode.get(5, TimeUnit.SECONDS);
  }

  @Test
  void anUnknownSessionIsClosedWith4404() throws Exception {
    WsTestClient client = open("AAAAAAAAAAAAAAAAAAAAAA");
    client.hello(SessionFixtures.ALICE_TOKEN);
    assertThat(closeCodeOf(client)).isEqualTo(4404);
  }

  @Test
  void aMalformedSessionIdIsClosedWith4404() throws Exception {
    WsTestClient client = open("not-a-session-id");
    client.hello(SessionFixtures.ALICE_TOKEN);
    assertThat(closeCodeOf(client)).isEqualTo(4404);
  }

  @Test
  void anUnknownParticipantTokenIsClosedWith4401() throws Exception {
    WsTestClient client = open(SessionFixtures.SESSION_ID);
    client.hello("nobody");
    assertThat(closeCodeOf(client)).isEqualTo(4401);
  }

  @Test
  void theTokenOfAnotherSessionIsUnknown() throws Exception {
    jdbc.update(
        "insert into session (session_id, animation_token_hash, name, status, method,"
            + " method_version, scale_type, scale_max, created_at, created_by_pseudo)"
            + " values ('BBBBBBBBBBBBBBBBBBBBBB', 'h', 'Autre', 'PREPARATION', 'WSJF', 1,"
            + " 'CONTINUOUS', 10, now(), 'Zoe')");
    WsTestClient client = open("BBBBBBBBBBBBBBBBBBBBBB");
    client.hello(SessionFixtures.ALICE_TOKEN);
    assertThat(closeCodeOf(client)).isEqualTo(4401);
  }

  @Test
  void aFirstMessageThatIsNotAHelloIsClosedWith1008() throws Exception {
    WsTestClient client = open(SessionFixtures.SESSION_ID);
    client.send("{\"type\":\"heartbeat\"}");
    assertThat(closeCodeOf(client)).isEqualTo(1008);
  }

  @Test
  void anInvalidHelloIsClosedWith1008() throws Exception {
    for (String payload :
        new String[] {
          "not json",
          "{\"type\":\"hello\"}",
          "{\"type\":\"hello\",\"participantToken\":\"\"}",
          "{\"type\":\"hello\",\"participantToken\":42}",
          "{\"type\":\"hello\",\"participantToken\":\"x\",\"extra\":1}",
          "{\"type\":\"hello\",\"participantToken\":\"" + "x".repeat(65) + "\"}",
          "{\"type\":\"hello\",\"participantToken\":\"x\",\"animationToken\":\"\"}"
        }) {
      WsTestClient client = open(SessionFixtures.SESSION_ID);
      client.send(payload);
      assertThat(closeCodeOf(client)).as(payload).isEqualTo(1008);
    }
  }

  @Test
  void aBinaryFirstMessageIsClosedWith1008() throws Exception {
    WsTestClient client = open(SessionFixtures.SESSION_ID);
    client.socket.sendBinary(java.nio.ByteBuffer.wrap(new byte[] {1, 2}), true).join();
    assertThat(closeCodeOf(client)).isEqualTo(1008);
  }

  @Test
  void aHelloWithoutAnyFollowUpWithinTheDelayIsClosedWith1008() throws Exception {
    WsTestClient client = open(SessionFixtures.SESSION_ID);
    assertThat(closeCodeOf(client)).isEqualTo(1008);
  }

  @Test
  void aValidHelloKeepsTheConnectionOpenAndRecordsPresence() throws Exception {
    WsTestClient client = open(SessionFixtures.SESSION_ID);
    client.hello(SessionFixtures.ALICE_TOKEN);

    // Pas de réponse tant que le sessionState n'est pas défini, mais la connexion reste ouverte.
    assertThat(client.next(500)).isNull();
    assertThat(client.closed.get()).isFalse();
    Timestamp lastSeen =
        jdbc.queryForObject(
            "select last_seen_at from participant where pseudo = 'Alice'", Timestamp.class);
    assertThat(lastSeen.toInstant()).isAfter(java.time.Instant.now().minusSeconds(30));
  }

  @Test
  void aValidAnimationTokenGetsNoError() throws Exception {
    WsTestClient client = open(SessionFixtures.SESSION_ID);
    client.hello(SessionFixtures.ALICE_TOKEN, SessionFixtures.ANIMATION_TOKEN);
    assertThat(client.next(500)).isNull();
    assertThat(client.closed.get()).isFalse();
  }

  @Test
  void anInvalidAnimationTokenIsAcceptedAsAPlainParticipantWithAForbiddenError() throws Exception {
    WsTestClient client = open(SessionFixtures.SESSION_ID);
    client.hello(SessionFixtures.ALICE_TOKEN, "wrong-animation-token");

    assertThat(client.next(5_000)).isEqualTo("{\"type\":\"error\",\"code\":\"FORBIDDEN\"}");
    assertThat(client.closed.get()).isFalse();
  }

  @Test
  void aHeartbeatHasNoEffectAndNoReply() throws Exception {
    WsTestClient client = open(SessionFixtures.SESSION_ID);
    client.hello(SessionFixtures.ALICE_TOKEN);
    client.send("{\"type\":\"heartbeat\"}");
    assertThat(client.next(500)).isNull();
    assertThat(client.closed.get()).isFalse();
  }

  @Test
  void invalidMessagesAfterTheHelloGetInvalidMessageAndChangeNothing() throws Exception {
    WsTestClient client = open(SessionFixtures.SESSION_ID);
    client.hello(SessionFixtures.ALICE_TOKEN);
    for (String payload :
        new String[] {
          "not json",
          "[]",
          "{\"type\":\"teapot\"}",
          "{\"type\":\"heartbeat\",\"extra\":1}",
          "{\"type\":\"hello\",\"participantToken\":\"" + SessionFixtures.ALICE_TOKEN + "\"}",
          "{\"noType\":true}"
        }) {
      client.send(payload);
      assertThat(client.next(5_000))
          .as(payload)
          .isEqualTo("{\"type\":\"error\",\"code\":\"INVALID_MESSAGE\"}");
    }
    assertThat(client.closed.get()).isFalse();
  }

  @Test
  void aBinaryMessageAfterTheHelloGetsInvalidMessage() throws Exception {
    WsTestClient client = open(SessionFixtures.SESSION_ID);
    client.hello(SessionFixtures.ALICE_TOKEN);
    client.socket.sendBinary(java.nio.ByteBuffer.wrap(new byte[] {1}), true).join();
    assertThat(client.next(5_000)).contains("INVALID_MESSAGE");
  }

  @Test
  void aMessageLargerThan16KbClosesTheConnectionWith1009() throws Exception {
    WsTestClient client = open(SessionFixtures.SESSION_ID);
    client.hello(SessionFixtures.ALICE_TOKEN);
    client.send("{\"type\":\"heartbeat\",\"pad\":\"" + "x".repeat(17 * 1024) + "\"}");
    assertThat(closeCodeOf(client)).isEqualTo(1009);
  }

  @Test
  void closingTheLastConnectionRecordsTheLastSeenTime() throws Exception {
    UUID alice =
        jdbc.queryForObject("select id from participant where pseudo = 'Alice'", UUID.class);
    jdbc.update(
        "update participant set last_seen_at = now() - interval '1 hour' where id = ?", alice);
    WsTestClient client = open(SessionFixtures.SESSION_ID);
    client.hello(SessionFixtures.ALICE_TOKEN);
    assertThat(client.next(300)).isNull();
    jdbc.update(
        "update participant set last_seen_at = now() - interval '1 hour' where id = ?", alice);
    client.socket.sendClose(1000, "bye").join();
    long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
    java.time.Instant lastSeen;
    do {
      Thread.sleep(50);
      lastSeen =
          jdbc.queryForObject(
                  "select last_seen_at from participant where id = ?", Timestamp.class, alice)
              .toInstant();
    } while (lastSeen.isBefore(java.time.Instant.now().minusSeconds(30))
        && System.nanoTime() < deadline);
    assertThat(lastSeen).isAfter(java.time.Instant.now().minusSeconds(30));
  }

  @Test
  void anOriginOutsideAllowedOriginsCannotConnect() throws Exception {
    org.assertj.core.api.Assertions.assertThatThrownBy(
            () ->
                http.newWebSocketBuilder()
                    .header("Origin", "https://evil.example")
                    .buildAsync(
                        java.net.URI.create(
                            "ws://localhost:"
                                + port
                                + "/ws/sessions/"
                                + SessionFixtures.SESSION_ID),
                        new WsTestClient())
                    .get(5, TimeUnit.SECONDS))
        .isInstanceOf(java.util.concurrent.ExecutionException.class);
  }
}
