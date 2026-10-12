package com.priorisationepic.application;

import com.priorisationepic.domain.ParticipantIdentity;
import com.priorisationepic.domain.SessionId;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Ouverture, activité et fermeture d'une connexion WebSocket à une session. Les droits d'animateur
 * ne viennent que d'un jeton d'animation valide présenté dans {@code hello} : le pseudo seul ne
 * suffit jamais.
 */
public class SessionConnectionUseCase {

  /** {@code last_seen_at} n'est écrit en base qu'une fois toutes les 30 s par participant. */
  static final Duration LAST_SEEN_PERIOD = Duration.ofSeconds(30);

  private static final Logger LOG = LoggerFactory.getLogger(SessionConnectionUseCase.class);

  private final SessionRepository sessions;
  private final ParticipantRepository participants;
  private final Broadcaster broadcaster;
  private final SessionLocks locks;
  private final ClockPort clock;
  private final Map<UUID, Instant> lastSeenWritten = new ConcurrentHashMap<>();

  public SessionConnectionUseCase(
      SessionRepository sessions,
      ParticipantRepository participants,
      Broadcaster broadcaster,
      SessionLocks locks,
      ClockPort clock) {
    this.sessions = sessions;
    this.participants = participants;
    this.broadcaster = broadcaster;
    this.locks = locks;
    this.clock = clock;
  }

  /**
   * Poignée de main : session d'abord ({@code 4404}), puis jeton de participant ({@code 4401}),
   * puis jeton d'animation facultatif, puis rattachement de la connexion et premier {@code
   * sessionState}.
   *
   * @param rawSessionId identifiant pris dans le chemin, ou {@code null} s'il est mal formé
   * @param animationToken jeton d'animation, ou {@code null}
   */
  public ConnectResult connect(
      String rawSessionId, String participantToken, String animationToken, String connectionId) {
    if (!SessionId.isValid(rawSessionId)) {
      return new ConnectResult.SessionNotFound();
    }
    SessionId sessionId = new SessionId(rawSessionId);
    ConnectResult result =
        locks.withLock(
            sessionId,
            () -> {
              if (!sessions.exists(sessionId)) {
                return new ConnectResult.SessionNotFound();
              }
              ParticipantIdentity participant =
                  participants.findByToken(sessionId, participantToken).orElse(null);
              if (participant == null) {
                return new ConnectResult.UnknownToken();
              }
              boolean facilitator =
                  animationToken != null
                      && sessions.animationTokenMatches(sessionId, animationToken);
              boolean rejected = animationToken != null && !facilitator;
              boolean alreadyOnline = broadcaster.hasConnection(sessionId, participant.id());
              if (!broadcaster.attach(connectionId, sessionId, participant.id(), facilitator)) {
                return new ConnectResult.ConnectionClosed();
              }
              Instant now = clock.now();
              participants.updateLastSeen(participant.id(), now);
              lastSeenWritten.put(participant.id(), now);
              if (alreadyOnline) {
                broadcaster.publishTo(connectionId);
              } else {
                // Première connexion du participant : les autres le voient en ligne (FR-005).
                broadcaster.publish(sessionId);
              }
              if (rejected) {
                broadcaster.sendError(connectionId, ErrorCode.FORBIDDEN);
              }
              return new ConnectResult.Connected(participant.id(), facilitator, rejected);
            });
    if (result instanceof ConnectResult.Connected connected) {
      // Ni jeton, ni pseudo, ni identifiant de session (le lien) dans les journaux.
      LOG.info("Participant {} opened a connection", connected.participantId());
    }
    return result;
  }

  /**
   * Fermeture d'une connexion. Sans effet si elle n'était pas rattachée. À la fermeture de la
   * dernière connexion du participant, sa dernière activité est enregistrée et son absence est
   * diffusée.
   */
  public void disconnect(SessionId sessionId, UUID participantId, String connectionId) {
    boolean detached =
        locks.withLock(
            sessionId,
            () -> {
              if (!broadcaster.detach(connectionId)) {
                return false;
              }
              if (!broadcaster.hasConnection(sessionId, participantId)) {
                Instant now = clock.now();
                participants.updateLastSeen(participantId, now);
                lastSeenWritten.remove(participantId);
                // Dernière connexion fermée : les autres le voient hors ligne (FR-005).
                broadcaster.publish(sessionId);
              }
              return true;
            });
    if (detached) {
      LOG.info("Participant {} closed a connection", participantId);
    }
  }

  /**
   * Signe de vie d'un participant ({@code heartbeat}, pong ou message) : {@code last_seen_at} est
   * écrit au plus une fois toutes les 30 s. Aucune diffusion.
   */
  public void touch(UUID participantId) {
    Instant now = clock.now();
    Instant written = lastSeenWritten.get(participantId);
    if (written != null && Duration.between(written, now).compareTo(LAST_SEEN_PERIOD) < 0) {
      return;
    }
    lastSeenWritten.put(participantId, now);
    participants.updateLastSeen(participantId, now);
  }
}
