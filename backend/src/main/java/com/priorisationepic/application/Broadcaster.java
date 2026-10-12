package com.priorisationepic.application;

import com.priorisationepic.domain.SessionId;
import java.util.UUID;

/**
 * Connexions ouvertes d'une session et diffusion de {@code sessionState}. Après chaque intention
 * acceptée, {@link #publish} envoie à chaque connexion de la session <b>son propre</b> état, filtré
 * pour son destinataire (FR-019, FR-019a, SC-004).
 */
public interface Broadcaster {

  /** Rattache la connexion à un participant ; faux si elle est déjà fermée ou rattachée. */
  boolean attach(String connectionId, SessionId sessionId, UUID participantId, boolean facilitator);

  /** Détache la connexion ; faux si elle n'était pas rattachée. */
  boolean detach(String connectionId);

  /** Vrai si le participant a au moins une connexion rattachée. */
  boolean hasConnection(SessionId sessionId, UUID participantId);

  /** Envoie son {@code sessionState} à chaque connexion de la session. */
  void publish(SessionId sessionId);

  /**
   * Change les droits d'animateur de toutes les connexions du participant (prise ou transmission du
   * rôle, FR-002a).
   */
  void setFacilitator(SessionId sessionId, UUID participantId, boolean facilitator);

  /** Envoie {@code facilitatorHandover} aux seules connexions du participant. */
  void sendHandover(SessionId sessionId, UUID participantId, String animationToken);

  /** Envoie son {@code sessionState} à une seule connexion. */
  void publishTo(String connectionId);

  /** Envoie {@code error} à une seule connexion. */
  default void sendError(String connectionId, ErrorCode code) {
    sendError(connectionId, code, null);
  }

  /**
   * Envoie {@code error} à une seule connexion, avec la fonctionnalité visée si elle est connue.
   */
  void sendError(String connectionId, ErrorCode code, UUID featureId);
}
