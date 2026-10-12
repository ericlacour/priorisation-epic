package com.priorisationepic.application;

import com.priorisationepic.domain.SessionId;

/** Accès aux tours de vote d'une session. Étendu avec le parcours de vote. */
public interface RoundRepository {

  /** Vrai si la session a un tour {@code OPEN}. */
  boolean hasOpenRound(SessionId sessionId);
}
