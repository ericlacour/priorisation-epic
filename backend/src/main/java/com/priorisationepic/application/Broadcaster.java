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

  /** Envoie son {@code sessionState} à une seule connexion. */
  void publishTo(String connectionId);

  /** Envoie {@code error} à une seule connexion. */
  void sendError(String connectionId, ErrorCode code);

  /** Envoie {@code error} avec la fonctionnalité concernée ({@code null} : aucune). */
  default void sendError(String connectionId, ErrorCode code, UUID featureId) {
    sendError(connectionId, code);
  }

  /**
   * Envoie le refus d'une intention : {@code error} avec son code, la fonctionnalité concernée et,
   * pour {@code SCALE_IMPACT}, les valeurs impactées.
   */
  default void sendRejection(String connectionId, IntentRejectedException rejection) {
    sendError(connectionId, rejection.code(), rejection.featureId());
  }
}
