package com.priorisationepic.application;

import com.priorisationepic.domain.SessionId;
import java.util.Set;
import java.util.UUID;

/** Accès aux tours de vote d'une session. Étendu avec le parcours de vote. */
public interface RoundRepository {

  /** Vrai si la session a un tour {@code OPEN}. */
  boolean hasOpenRound(SessionId sessionId);

  /** Les fonctionnalités du tour {@code OPEN} de la session, s'il y en a un (FR-018). */
  Set<UUID> featuresInOpenRound(SessionId sessionId);
}
