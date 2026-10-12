package com.priorisationepic.adapter.in.ws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.priorisationepic.domain.SessionId;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.PingMessage;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;

/**
 * File d'envoi d'une connexion : ordre conservé, jamais bloquante, fermeture de la connexion qui
 * déborde.
 */
class WsConnectionTest {

  private static final SessionId SESSION = new SessionId("k3Jx9QvT2mLpZ8wR4nYb7A");

  private final ExecutorService senders = Executors.newVirtualThreadPerTaskExecutor();
  private final WebSocketSession session = mock(WebSocketSession.class);
  private final List<String> sent = new CopyOnWriteArrayList<>();

  @AfterEach
  void stop() {
    senders.shutdownNow();
  }

  private WsConnection connection(CountDownLatch release) throws Exception {
    when(session.getId()).thenReturn("c1");
    when(session.isOpen()).thenReturn(true);
    doAnswer(
            invocation -> {
              release.await(5, TimeUnit.SECONDS);
              sent.add(((WebSocketMessage<?>) invocation.getArgument(0)).getPayload().toString());
              return null;
            })
        .when(session)
        .sendMessage(any());
    return new WsConnection(session, senders, Instant.EPOCH);
  }

  @Test
  void sendsInOrderWithoutBlockingTheCaller() throws Exception {
    CountDownLatch release = new CountDownLatch(1);
    WsConnection connection = connection(release);
    long start = System.nanoTime();
    for (int i = 0; i < 20; i++) {
      connection.enqueue(new TextMessage("m" + i));
    }
    assertThat(System.nanoTime() - start).isLessThan(TimeUnit.MILLISECONDS.toNanos(500));
    release.countDown();
    verify(session, timeout(2_000).times(20)).sendMessage(any());
    assertThat(sent)
        .containsExactlyElementsOf(
            java.util.stream.IntStream.range(0, 20).mapToObj(i -> "m" + i).toList());
    verify(session, never()).close(any());
  }

  @Test
  void aConnectionThatOverflowsItsBufferIsClosed() throws Exception {
    CountDownLatch release = new CountDownLatch(1);
    WsConnection connection = connection(release);
    String big = "x".repeat(16 * 1024);
    for (int i = 0; i < 6; i++) {
      connection.enqueue(new TextMessage(big));
    }
    verify(session, timeout(2_000)).close(CloseStatus.SESSION_NOT_RELIABLE);
    release.countDown();
  }

  @Test
  void aSendBlockedOverTheTimeLimitIsClosed() throws Exception {
    CountDownLatch release = new CountDownLatch(1);
    WsConnection connection = connection(release);
    connection.enqueue(new TextMessage("blocked"));
    verify(session, timeout(1_000)).sendMessage(any());
    Thread.sleep(WsConnection.SEND_TIME_LIMIT_MS + 200);

    connection.enqueue(new TextMessage("small"));
    verify(session, timeout(2_000)).close(CloseStatus.SESSION_NOT_RELIABLE);
    release.countDown();
  }

  @Test
  void aFailedSendStopsAndClosesTheConnection() throws Exception {
    when(session.getId()).thenReturn("c1");
    when(session.isOpen()).thenReturn(true);
    doThrow(new IOException("broken pipe")).when(session).sendMessage(any());
    WsConnection connection = new WsConnection(session, senders, Instant.EPOCH);

    connection.enqueue(new TextMessage("first"));
    verify(session, timeout(2_000)).close(CloseStatus.SESSION_NOT_RELIABLE);
    connection.enqueue(new TextMessage("second"));
    Thread.sleep(200);
    verify(session, times(1)).sendMessage(any());
  }

  @Test
  void attachingAClosedConnectionFails() throws Exception {
    WsConnection connection = connection(new CountDownLatch(0));
    UUID participant = UUID.randomUUID();
    assertThat(connection.markClosed()).isNull();
    assertThat(connection.attach(SESSION, participant, false)).isFalse();

    WsConnection other = new WsConnection(session, senders, Instant.EPOCH);
    assertThat(other.attach(SESSION, participant, false)).isTrue();
    assertThat(other.attach(SESSION, participant, false)).isFalse();
    assertThat(other.markClosed())
        .isEqualTo(new WsConnection.Attachment(SESSION, participant, false));
  }

  @Test
  void aProtocolPingGoesThroughTheSendQueueInOrder() throws Exception {
    CountDownLatch release = new CountDownLatch(1);
    WsConnection connection = connection(release);
    connection.enqueue(new TextMessage("before"));
    connection.enqueue(new PingMessage());
    connection.enqueue(new TextMessage("after"));
    release.countDown();
    verify(session, timeout(2_000).times(3)).sendMessage(any());
    assertThat(sent).hasSize(3);
    assertThat(sent.get(0)).isEqualTo("before");
    assertThat(sent.get(2)).isEqualTo("after");
    verify(session).sendMessage(any(PingMessage.class));
  }

  @Test
  void aDetachedConnectionIsNeverAttachedAgain() throws Exception {
    WsConnection connection = connection(new CountDownLatch(0));
    UUID participant = UUID.randomUUID();
    assertThat(connection.attach(SESSION, participant, false)).isTrue();
    assertThat(connection.detach())
        .isEqualTo(new WsConnection.Attachment(SESSION, participant, false));
    assertThat(connection.attachment()).isNull();
    assertThat(connection.detach()).isNull();
    assertThat(connection.attach(SESSION, participant, false)).isFalse();
    assertThat(connection.markClosed()).isNull();
  }

  @Test
  void closeLaterClosesOnTheSenderExecutor() throws Exception {
    WsConnection connection = connection(new CountDownLatch(0));
    connection.closeLater(CloseStatus.SESSION_NOT_RELIABLE);
    verify(session, timeout(2_000)).close(CloseStatus.SESSION_NOT_RELIABLE);
  }

  @Test
  void tracksItsLastActivity() {
    WsConnection connection = new WsConnection(session, senders, Instant.EPOCH);
    assertThat(connection.lastActivity()).isEqualTo(Instant.EPOCH);
    connection.markActive(Instant.EPOCH.plusSeconds(7));
    assertThat(connection.lastActivity()).isEqualTo(Instant.EPOCH.plusSeconds(7));
  }
}
