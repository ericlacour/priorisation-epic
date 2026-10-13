package com.priorisationepic.application;

import com.priorisationepic.domain.SessionId;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Construit le {@code sessionState} d'une session pour un destinataire, filtré selon ses droits
 * (animateur ou non). L'objet renvoyé est sérialisé tel quel en JSON par l'adaptateur WebSocket.
 */
public interface SessionStateProvider {

  /** L'état pour ce participant, ou rien s'il n'est plus dans la session. */
  Optional<Object> stateFor(SessionId sessionId, UUID participantId, boolean facilitator);

  /** Un destinataire : un participant, avec ou sans les droits d'animateur de sa connexion. */
  record Recipient(UUID participantId, boolean facilitator) {}

  /**
   * L'état de chaque destinataire encore dans la session (les autres sont absents de la table). Une
   * implémentation peut lire la session une seule fois pour tous.
   */
  default Map<Recipient, Object> statesFor(SessionId sessionId, Set<Recipient> recipients) {
    Map<Recipient, Object> states = new LinkedHashMap<>();
    for (Recipient recipient : recipients) {
      stateFor(sessionId, recipient.participantId(), recipient.facilitator())
          .ifPresent(state -> states.put(recipient, state));
    }
    return states;
  }
}
