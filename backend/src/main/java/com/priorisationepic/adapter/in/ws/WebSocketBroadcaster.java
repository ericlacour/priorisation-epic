package com.priorisationepic.adapter.in.ws;

import com.priorisationepic.application.Broadcaster;
import com.priorisationepic.application.ClockPort;
import com.priorisationepic.application.ConnectionMaintenance;
import com.priorisationepic.application.ErrorCode;
import com.priorisationepic.application.SessionStateProvider;
import com.priorisationepic.application.SessionStateProvider.Recipient;
import com.priorisationepic.domain.SessionId;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.PingMessage;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.json.JsonMapper;

/**
 * Registre des connexions ouvertes et diffusion des états. Après une intention acceptée, {@link
 * #publish} construit <b>un {@code sessionState} par connexion</b>, filtré pour son destinataire
 * (animateur ou non), et le confie à la file d'envoi de la connexion, servie hors de tout verrou de
 * session ({@link WsConnection}). Sert aussi {@code tick}, le ping de protocole et la fermeture des
 * connexions silencieuses, déclenchés par {@code ConnectionKeepAliveScheduler}.
 */
@Component
public class WebSocketBroadcaster implements Broadcaster, ConnectionMaintenance, DisposableBean {

  private final JsonMapper jsonMapper;
  private final SessionStateProvider states;
  private final ClockPort clock;
  private final ExecutorService senders =
      Executors.newThreadPerTaskExecutor(Thread.ofVirtual().name("ws-send-", 0).factory());
  private final Map<String, WsConnection> connections = new ConcurrentHashMap<>();
  private final Map<SessionId, Set<WsConnection>> bySession = new ConcurrentHashMap<>();
  private final TextMessage tick;

  public WebSocketBroadcaster(JsonMapper jsonMapper, SessionStateProvider states, ClockPort clock) {
    this.jsonMapper = jsonMapper;
    this.states = states;
    this.clock = clock;
    this.tick = toText(ServerMessages.TickMessage.INSTANCE);
  }

  /** Enregistre une connexion qui vient de s'ouvrir, pas encore rattachée. */
  WsConnection open(WebSocketSession session) {
    WsConnection connection = new WsConnection(session, senders, clock.now());
    connections.put(connection.id(), connection);
    return connection;
  }

  /**
   * La connexion s'est fermée. Renvoie son rattachement, que l'appelant détache par le cas d'usage
   * ; une connexion jamais rattachée est oubliée tout de suite.
   */
  WsConnection.Attachment closed(String connectionId) {
    WsConnection connection = connections.get(connectionId);
    if (connection == null) {
      return null;
    }
    WsConnection.Attachment attachment = connection.markClosed();
    if (attachment == null) {
      connections.remove(connectionId);
    }
    return attachment;
  }

  /** Oublie une connexion refusée à la poignée de main (jamais rattachée). */
  void forget(String connectionId) {
    WsConnection connection = connections.get(connectionId);
    if (connection != null && connection.attachment() == null) {
      connections.remove(connectionId);
    }
  }

  /**
   * Rattachement de la connexion ouverte, ou {@code null} si elle n'est pas (ou plus) rattachée.
   */
  WsConnection.Attachment attachmentOf(String connectionId) {
    WsConnection connection = connections.get(connectionId);
    return connection == null ? null : connection.attachment();
  }

  /** Note une activité (message ou pong) sur la connexion. */
  void markActive(String connectionId) {
    WsConnection connection = connections.get(connectionId);
    if (connection != null) {
      connection.markActive(clock.now());
    }
  }

  @Override
  public boolean attach(
      String connectionId, SessionId sessionId, UUID participantId, boolean facilitator) {
    WsConnection connection = connections.get(connectionId);
    if (connection == null || !connection.attach(sessionId, participantId, facilitator)) {
      return false;
    }
    bySession.computeIfAbsent(sessionId, id -> ConcurrentHashMap.newKeySet()).add(connection);
    return true;
  }

  /**
   * Détache la connexion. Encore ouverte, elle reste connue jusqu'à sa fermeture ; sa fermeture
   * renverra alors {@code null} ({@link #closed}).
   */
  @Override
  public boolean detach(String connectionId) {
    WsConnection connection = connections.get(connectionId);
    if (connection == null) {
      return false;
    }
    WsConnection.Attachment attachment = connection.detach();
    if (connection.isClosed()) {
      connections.remove(connectionId);
    }
    if (attachment == null) {
      return false;
    }
    bySession.computeIfPresent(
        attachment.sessionId(),
        (id, set) -> {
          set.remove(connection);
          return set.isEmpty() ? null : set;
        });
    return true;
  }

  @Override
  public boolean hasConnection(SessionId sessionId, UUID participantId) {
    Set<WsConnection> targets = bySession.get(sessionId);
    if (targets == null) {
      return false;
    }
    return targets.stream()
        .map(WsConnection::attachment)
        .anyMatch(a -> a != null && a.participantId().equals(participantId));
  }

  @Override
  public void publish(SessionId sessionId) {
    Set<WsConnection> targets = bySession.get(sessionId);
    if (targets == null) {
      return;
    }
    // La session est lue une seule fois pour tous ; un état par participant et par niveau de
    // droits, partagé entre ses connexions identiques.
    Map<WsConnection, Recipient> recipients = new HashMap<>();
    for (WsConnection connection : targets) {
      WsConnection.Attachment attachment = connection.attachment();
      if (attachment != null) {
        recipients.put(
            connection, new Recipient(attachment.participantId(), attachment.facilitator()));
      }
    }
    Map<Recipient, Object> built = states.statesFor(sessionId, new HashSet<>(recipients.values()));
    Map<Recipient, TextMessage> texts = new HashMap<>();
    recipients.forEach(
        (connection, recipient) -> {
          Object state = built.get(recipient);
          if (state != null) {
            connection.enqueue(texts.computeIfAbsent(recipient, r -> toText(state)));
          }
        });
  }

  @Override
  public void publishTo(String connectionId) {
    WsConnection connection = connections.get(connectionId);
    if (connection == null || connection.attachment() == null) {
      return;
    }
    stateText(connection.attachment()).ifPresent(connection::enqueue);
  }

  @Override
  public void sendError(String connectionId, ErrorCode code) {
    sendError(connectionId, code, null);
  }

  @Override
  public void sendError(String connectionId, ErrorCode code, UUID featureId) {
    WsConnection connection = connections.get(connectionId);
    if (connection != null && connection.attachment() != null) {
      connection.enqueue(toText(ServerMessages.ErrorMessage.of(code, featureId)));
    }
  }

  private Optional<TextMessage> stateText(WsConnection.Attachment attachment) {
    return states
        .stateFor(attachment.sessionId(), attachment.participantId(), attachment.facilitator())
        .map(this::toText);
  }

  @Override
  public void sendTicks() {
    sendToAttached(tick);
  }

  @Override
  public void sendPings() {
    sendToAttached(new PingMessage());
  }

  @Override
  public int closeIdle(Duration timeout) {
    Instant now = clock.now();
    int closed = 0;
    for (WsConnection connection : connections.values()) {
      if (!connection.isClosed()
          && Duration.between(connection.lastActivity(), now).compareTo(timeout) > 0) {
        connection.closeLater(CloseStatus.GOING_AWAY.withReason("Silence"));
        closed++;
      }
    }
    return closed;
  }

  private void sendToAttached(WebSocketMessage<?> message) {
    for (Set<WsConnection> set : bySession.values()) {
      for (WsConnection connection : set) {
        connection.enqueue(message);
      }
    }
  }

  private TextMessage toText(Object message) {
    return new TextMessage(jsonMapper.writeValueAsString(message));
  }

  @Override
  public void destroy() {
    senders.shutdownNow();
  }
}
