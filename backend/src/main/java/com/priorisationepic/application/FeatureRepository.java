package com.priorisationepic.application;

import com.priorisationepic.domain.SessionId;

/** Accès aux fonctionnalités d'une session. Étendu avec le parcours de préparation. */
public interface FeatureRepository {

  /** Nombre de fonctionnalités non supprimées de la session. */
  int countActive(SessionId sessionId);
}
