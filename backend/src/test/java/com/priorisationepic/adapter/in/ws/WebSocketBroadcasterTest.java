package com.priorisationepic.adapter.in.ws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.priorisationepic.application.ErrorCode;
import com.priorisationepic.application.MutableClock;
import com.priorisationepic.application.SessionStateProvider;
import com.priorisationepic.domain.SessionId;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.PingMessage;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.json.JsonMapper;

/** Un {@code sessionState} par connexion, filtré pour son destinataire ; tick, ping et silence. */
class WebSocketBroadcasterTest {

  private static final SessionId S1 = new SessionId("k3Jx9QvT2mLpZ8wR4nYb7A");
  private static final SessionId S2 = new SessionId("BBBBBBBBBBBBBBBBBBBBBB");
  private static final UUID ALICE = UUID.randomUUID();
  private static final UUID BOB = UUID.randomUUID();
  private static final UUID GONE = UUID.randomUUID();

  private final JsonMapper json = JsonMapper.builder().build();
  private final MutableClock clock = new MutableClock(Instant.parse("2026-10-12T08:00:00Z"));
  private final SessionStateProvider provider =
      (session, participant, facilitator) ->
          participant.equals(GONE)
              ? Optional.empty()
              : Optional.of(
                  Map.of(
                      "type",
                      "sessionState",
                      "for",
                      participant.toString(),
                      "facilitator",
                      facilitator));
  private final WebSocketBroadcaster broadcaster =
      new WebSocketBroadcaster(json, provider, clock::instant);

  @AfterEach
  void stop() {
    broadcaster.destroy();
  }

  private WebSocketSession socket(String id) throws IOException {
    WebSocketSession session = mock(WebSocketSession.class);
    when(session.getId()).thenReturn(id);
    when(session.isOpen()).thenReturn(true);
    broadcaster.open(session);
    return session;
  }

  private static String lastPayload(WebSocketSession session) throws IOException {
    ArgumentCaptor<WebSocketMessage<?>> sent = ArgumentCaptor.forClass(WebSocketMessage.class);
    verify(session, timeout(2_000)).sendMessage(sent.capture());
    return sent.getValue().getPayload().toString();
  }

  @Test
  void everyConnectionOfTheSessionGetsItsOwnFilteredState() throws Exception {
    WebSocketSession alice = socket("a");
    WebSocketSession bob = socket("b");
    WebSocketSession other = socket("o");
    broadcaster.attach("a", S1, ALICE, true);
    broadcaster.attach("b", S1, BOB, false);
    broadcaster.attach("o", S2, ALICE, true);

    broadcaster.publish(S1);

    var forAlice = json.readTree(lastPayload(alice));
    assertThat(forAlice.get("for").asString()).isEqualTo(ALICE.toString());
    assertThat(forAlice.get("facilitator").asBoolean()).isTrue();
    var forBob = json.readTree(lastPayload(bob));
    assertThat(forBob.get("for").asString()).isEqualTo(BOB.toString());
    assertThat(forBob.get("facilitator").asBoolean()).isFalse();
    verify(other, never()).sendMessage(any());
  }

  @Test
  void theSameParticipantWithDifferentRightsGetsDifferentStates() throws Exception {
    WebSocketSession asFacilitator = socket("f");
    WebSocketSession asParticipant = socket("p");
    broadcaster.attach("f", S1, ALICE, true);
    broadcaster.attach("p", S1, ALICE, false);

    broadcaster.publish(S1);

    assertThat(json.readTree(lastPayload(asFacilitator)).get("facilitator").asBoolean()).isTrue();
    assertThat(json.readTree(lastPayload(asParticipant)).get("facilitator").asBoolean()).isFalse();
  }

  @Test
  void aParticipantWhoLeftTheSessionGetsNothing() throws Exception {
    WebSocketSession gone = socket("g");
    broadcaster.attach("g", S1, GONE, false);

    broadcaster.publish(S1);
    broadcaster.publishTo("g");

    Thread.sleep(150);
    verify(gone, never()).sendMessage(any());
  }

  @Test
  void publishToTargetsOneConnectionOnly() throws Exception {
    WebSocketSession alice = socket("a");
    WebSocketSession bob = socket("b");
    broadcaster.attach("a", S1, ALICE, false);
    broadcaster.attach("b", S1, BOB, false);

    broadcaster.publishTo("b");

    lastPayload(bob);
    verify(alice, never()).sendMessage(any());
  }

  @Test
  void publishingToAnUnattachedOrUnknownConnectionDoesNothing() throws Exception {
    WebSocketSession loose = socket("l");
    broadcaster.publishTo("l");
    broadcaster.publishTo("unknown");
    broadcaster.publish(S1);
    Thread.sleep(100);
    verify(loose, never()).sendMessage(any());
  }

  @Test
  void errorsGoToOneAttachedConnection() throws Exception {
    WebSocketSession alice = socket("a");
    WebSocketSession bob = socket("b");
    broadcaster.attach("a", S1, ALICE, false);
    broadcaster.attach("b", S1, BOB, false);

    broadcaster.sendError("a", ErrorCode.FORBIDDEN);
    broadcaster.sendError("unattached", ErrorCode.FORBIDDEN);

    assertThat(lastPayload(alice)).isEqualTo("{\"type\":\"error\",\"code\":\"FORBIDDEN\"}");
    verify(bob, never()).sendMessage(any());
  }

  @Test
  void ticksAndPingsReachAttachedConnectionsOnly() throws Exception {
    WebSocketSession alice = socket("a");
    WebSocketSession loose = socket("l");
    broadcaster.attach("a", S1, ALICE, false);

    broadcaster.sendTicks();
    assertThat(lastPayload(alice)).isEqualTo("{\"type\":\"tick\"}");

    broadcaster.sendPings();
    ArgumentCaptor<WebSocketMessage<?>> sent = ArgumentCaptor.forClass(WebSocketMessage.class);
    verify(alice, timeout(2_000).times(2)).sendMessage(sent.capture());
    assertThat(sent.getAllValues().get(1)).isInstanceOf(PingMessage.class);
    verify(loose, never()).sendMessage(any());
  }

  @Test
  void aConnectionThatIsSilentForTooLongIsClosedAndAnActiveOneIsNot() throws Exception {
    WebSocketSession silent = socket("s");
    WebSocketSession active = socket("a");
    broadcaster.attach("s", S1, ALICE, false);
    broadcaster.attach("a", S1, BOB, false);

    clock.advance(Duration.ofSeconds(10));
    broadcaster.markActive("a");
    clock.advance(Duration.ofSeconds(6));

    assertThat(broadcaster.closeIdle(Duration.ofSeconds(15))).isEqualTo(1);
    ArgumentCaptor<CloseStatus> status = ArgumentCaptor.forClass(CloseStatus.class);
    verify(silent, timeout(2_000)).close(status.capture());
    assertThat(status.getValue().getCode()).isEqualTo(CloseStatus.GOING_AWAY.getCode());
    verify(active, never()).close(any(CloseStatus.class));
  }

  @Test
  void aConnectionIsNotIdleAtExactlyTheTimeout() throws Exception {
    socket("s");
    clock.advance(Duration.ofSeconds(15));
    assertThat(broadcaster.closeIdle(Duration.ofSeconds(15))).isZero();
  }

  @Test
  void trackingFollowsAttachAndDetach() throws Exception {
    socket("a");
    socket("b");
    assertThat(broadcaster.attach("a", S1, ALICE, false)).isTrue();
    assertThat(broadcaster.attach("a", S1, ALICE, false)).as("already attached").isFalse();
    assertThat(broadcaster.attach("ghost", S1, ALICE, false)).isFalse();
    assertThat(broadcaster.attach("b", S1, ALICE, false)).isTrue();
    assertThat(broadcaster.hasConnection(S1, ALICE)).isTrue();
    assertThat(broadcaster.hasConnection(S1, BOB)).isFalse();
    assertThat(broadcaster.hasConnection(S2, ALICE)).isFalse();

    assertThat(broadcaster.attachmentOf("a").facilitator()).isFalse();
    assertThat(broadcaster.detach("a")).isTrue();
    assertThat(broadcaster.detach("a")).as("already detached").isFalse();
    assertThat(broadcaster.hasConnection(S1, ALICE)).as("b remains").isTrue();
    assertThat(broadcaster.detach("b")).isTrue();
    assertThat(broadcaster.hasConnection(S1, ALICE)).isFalse();
    assertThat(broadcaster.detach("ghost")).isFalse();
  }

  @Test
  void aClosedConnectionReturnsItsAttachmentOnce() throws Exception {
    socket("a");
    broadcaster.attach("a", S1, ALICE, true);

    var attachment = broadcaster.closed("a");

    assertThat(attachment.participantId()).isEqualTo(ALICE);
    assertThat(attachment.facilitator()).isTrue();
    assertThat(broadcaster.detach("a")).isTrue();
    assertThat(broadcaster.closed("a")).as("forgotten after detach").isNull();
  }

  @Test
  void aNeverAttachedConnectionIsForgottenWhenItCloses() throws Exception {
    socket("l");
    assertThat(broadcaster.closed("l")).isNull();
    assertThat(broadcaster.closed("l")).isNull();
    assertThat(broadcaster.attachmentOf("l")).isNull();
  }
}
