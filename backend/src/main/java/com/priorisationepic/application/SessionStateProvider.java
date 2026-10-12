package com.priorisationepic.application;

import com.priorisationepic.domain.SessionId;
import java.util.Optional;
import java.util.UUID;

/**
 * Construit le {@code sessionState} d'une session pour un destinataire, filtré selon ses droits
 * (animateur ou non). L'objet renvoyé est sérialisé tel quel en JSON par l'adaptateur WebSocket.
 */
public interface SessionStateProvider {

  /** L'état pour ce participant, ou rien s'il n'est plus dans la session. */
  Optional<Object> stateFor(SessionId sessionId, UUID participantId, boolean facilitator);
}
