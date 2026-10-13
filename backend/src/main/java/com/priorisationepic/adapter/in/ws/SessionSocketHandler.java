package com.priorisationepic.adapter.in.ws;

import com.priorisationepic.adapter.in.ws.ClientMessages.AddFeatureMessage;
import com.priorisationepic.adapter.in.ws.ClientMessages.ClientMessage;
import com.priorisationepic.adapter.in.ws.ClientMessages.DeleteFeatureMessage;
import com.priorisationepic.adapter.in.ws.ClientMessages.HeartbeatMessage;
import com.priorisationepic.adapter.in.ws.ClientMessages.HelloMessage;
import com.priorisationepic.adapter.in.ws.ClientMessages.UpdateFeatureMessage;
import com.priorisationepic.application.ConnectResult;
import com.priorisationepic.application.ErrorCode;
import com.priorisationepic.application.FeatureUseCase;
import com.priorisationepic.application.IntentRejectedException;
import com.priorisationepic.application.Patch;
import com.priorisationepic.application.SessionConnectionUseCase;
import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.PongMessage;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.json.JsonMapper;

/**
 * Canal {@code /ws/sessions/{sessionId}} (asyncapi.yaml).
 *
 * <p>Poignée de main : un premier message autre qu'un {@code hello} conforme, ou aucun {@code
 * hello} dans le délai, ferme en {@code 1008} ; puis session inconnue (ou identifiant mal formé) en
 * {@code 4404}, jeton de participant inconnu en {@code 4401} ; sinon la connexion est rattachée et
 * reçoit son état. Un jeton d'animation valide fait de la connexion celle de l'animateur ;
 * invalide, elle reste celle d'un participant ordinaire et reçoit {@code error FORBIDDEN}. Seul
 * celui qui retire la connexion de {@code pendingHellos} poursuit la poignée de main : le délai et
 * le premier message ne se concurrencent jamais.
 *
 * <p>Ensuite, tout message et tout pong comptent comme activité ; {@code heartbeat} n'a pas d'autre
 * effet ; tout le reste (second {@code hello}, JSON invalide, {@code type} inconnu, message hors
 * schéma) reçoit {@code error INVALID_MESSAGE}, sans effet.
 */
@Component
public class SessionSocketHandler extends TextWebSocketHandler implements DisposableBean {

  static final CloseStatus SESSION_NOT_FOUND = new CloseStatus(4404, "Session not found");
  static final CloseStatus UNKNOWN_TOKEN = new CloseStatus(4401, "Unknown token");
  static final CloseStatus INVALID_HELLO =
      CloseStatus.POLICY_VIOLATION.withReason("hello expected");

  private static final Logger LOG = LoggerFactory.getLogger(SessionSocketHandler.class);

  private final JsonMapper jsonMapper;
  private final SessionConnectionUseCase connections;
  private final FeatureUseCase featureIntents;
  private final WebSocketBroadcaster broadcaster;
  private final Duration helloTimeout;
  private final ScheduledExecutorService timer =
      Executors.newSingleThreadScheduledExecutor(
          Thread.ofPlatform().daemon().name("ws-hello-timeout").factory());
  private final Map<String, PendingHello> pendingHellos = new ConcurrentHashMap<>();

  public SessionSocketHandler(
      JsonMapper jsonMapper,
      SessionConnectionUseCase connections,
      FeatureUseCase featureIntents,
      WebSocketBroadcaster broadcaster,
      @Value("${priorisation-epic.hello-timeout:5s}") Duration helloTimeout) {
    this.jsonMapper = jsonMapper;
    this.connections = connections;
    this.featureIntents = featureIntents;
    this.broadcaster = broadcaster;
    this.helloTimeout = helloTimeout;
  }

  @Override
  public void afterConnectionEstablished(WebSocketSession session) {
    broadcaster.open(session);
    // Inscrite avant d'être programmée : un délai qui expire avant la fin de cette méthode la
    // trouve.
    PendingHello pending = new PendingHello();
    pendingHellos.put(session.getId(), pending);
    pending.timeout =
        timer.schedule(
            () -> {
              if (pendingHellos.remove(session.getId(), pending)) {
                close(session, INVALID_HELLO);
              }
            },
            helloTimeout.toMillis(),
            TimeUnit.MILLISECONDS);
  }

  /** Attente du {@code hello} d'une connexion ; {@code timeout} est nul avant sa programmation. */
  private static final class PendingHello {
    volatile ScheduledFuture<?> timeout;

    void cancel() {
      ScheduledFuture<?> scheduled = timeout;
      if (scheduled != null) {
        scheduled.cancel(false);
      }
    }
  }

  @Override
  protected void handleTextMessage(WebSocketSession session, TextMessage message) {
    ClientMessage parsed = ClientMessages.parse(jsonMapper, message.getPayload());
    if (cancelTimeout(session)) {
      handshake(session, parsed);
      return;
    }
    touch(session);
    switch (parsed) {
      case HeartbeatMessage heartbeat -> {
        // Signe de vie du client : rien d'autre que l'activité.
      }
      case AddFeatureMessage add ->
          intent(
              session,
              (at) ->
                  featureIntents.add(
                      at.sessionId(),
                      at.participantId(),
                      at.facilitator(),
                      new FeatureUseCase.Add(
                          add.externalId(), add.title(), add.description(), add.criteria())));
      case UpdateFeatureMessage update ->
          intent(
              session,
              (at) ->
                  featureIntents.update(
                      at.sessionId(),
                      at.participantId(),
                      at.facilitator(),
                      new FeatureUseCase.Update(
                          update.featureId(),
                          update.version(),
                          patch(update, "externalId", update.externalId()),
                          patch(update, "title", update.title()),
                          patch(update, "description", update.description()),
                          update.criteria(),
                          patch(update, "markedForReview", update.markedForReview()),
                          patch(update, "reviewReason", update.reviewReason()))));
      case DeleteFeatureMessage delete ->
          intent(
              session,
              (at) ->
                  featureIntents.delete(
                      at.sessionId(),
                      at.participantId(),
                      at.facilitator(),
                      new FeatureUseCase.Delete(delete.featureId(), delete.version())));
      default -> broadcaster.sendError(session.getId(), ErrorCode.INVALID_MESSAGE);
    }
  }

  private static <T> Patch<T> patch(UpdateFeatureMessage message, String field, T value) {
    return message.present().contains(field) ? Patch.of(value) : Patch.absent();
  }

  /**
   * Exécute l'intention d'une connexion rattachée. Un refus ne change rien : la connexion reçoit
   * {@code error}. Une panne inattendue est journalisée sans détail identifiant et la connexion
   * reste ouverte.
   */
  private void intent(
      WebSocketSession session, java.util.function.Consumer<WsConnection.Attachment> action) {
    WsConnection.Attachment attachment = broadcaster.attachmentOf(session.getId());
    if (attachment == null) {
      broadcaster.sendError(session.getId(), ErrorCode.INVALID_MESSAGE);
      return;
    }
    try {
      action.accept(attachment);
    } catch (IntentRejectedException e) {
      broadcaster.sendError(session.getId(), e.code(), e.featureId());
    } catch (RuntimeException e) {
      LOG.error("Intent failed on connection {}", session.getId(), e);
    }
  }

  @Override
  protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) {
    if (cancelTimeout(session)) {
      close(session, INVALID_HELLO);
      return;
    }
    touch(session);
    broadcaster.sendError(session.getId(), ErrorCode.INVALID_MESSAGE);
  }

  @Override
  protected void handlePongMessage(WebSocketSession session, PongMessage message) {
    touch(session);
  }

  @Override
  public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
    if (status.getCode() == CloseStatus.TOO_BIG_TO_PROCESS.getCode()) {
      // Plafond du message entrant : une ligne, sans détail identifiant.
      LOG.info("WebSocket message refused: too large");
    }
    cancelTimeout(session);
    WsConnection.Attachment attachment = broadcaster.closed(session.getId());
    if (attachment != null) {
      connections.disconnect(attachment.sessionId(), attachment.participantId(), session.getId());
    }
  }

  @Override
  public void destroy() {
    timer.shutdownNow();
  }

  private void handshake(WebSocketSession session, ClientMessage parsed) {
    if (!(parsed instanceof HelloMessage hello)) {
      close(session, INVALID_HELLO);
      return;
    }
    ConnectResult result =
        connections.connect(
            sessionIdOf(session),
            hello.participantToken(),
            hello.animationToken(),
            session.getId());
    switch (result) {
      case ConnectResult.SessionNotFound notFound -> refuse(session, SESSION_NOT_FOUND);
      case ConnectResult.UnknownToken unknown -> refuse(session, UNKNOWN_TOKEN);
      case ConnectResult.ConnectionClosed gone -> broadcaster.forget(session.getId());
      case ConnectResult.Connected connected -> {
        // État déjà en file d'envoi.
      }
    }
  }

  /** Activité d'une connexion : jamais d'écriture en base plus d'une fois toutes les 30 s. */
  private void touch(WebSocketSession session) {
    broadcaster.markActive(session.getId());
    WsConnection.Attachment attachment = broadcaster.attachmentOf(session.getId());
    if (attachment != null) {
      connections.touch(attachment.participantId());
    }
  }

  private void refuse(WebSocketSession session, CloseStatus status) {
    broadcaster.forget(session.getId());
    close(session, status);
  }

  /** Identifiant de session pris dans le chemin ; {@code null} s'il n'a pas la forme du contrat. */
  static String sessionIdOf(WebSocketSession session) {
    URI uri = session.getUri();
    if (uri == null || uri.getRawPath() == null) {
      return null;
    }
    String path = uri.getRawPath();
    return path.substring(path.lastIndexOf('/') + 1);
  }

  /** Vrai si l'appelant a retiré la connexion de l'attente du {@code hello} et la traite seul. */
  private boolean cancelTimeout(WebSocketSession session) {
    PendingHello pending = pendingHellos.remove(session.getId());
    if (pending == null) {
      return false;
    }
    pending.cancel();
    return true;
  }

  private void close(WebSocketSession session, CloseStatus status) {
    try {
      if (session.isOpen()) {
        session.close(status);
      }
    } catch (IOException | IllegalStateException e) {
      LOG.debug("WebSocket close failed for connection {}", session.getId(), e);
    }
  }
}
