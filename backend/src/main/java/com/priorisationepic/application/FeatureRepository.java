package com.priorisationepic.application;

import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.method.MethodDefinition;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Accès aux fonctionnalités d'une session. */
public interface FeatureRepository {

  /** Nombre de fonctionnalités non supprimées de la session. */
  int countActive(SessionId sessionId);

  void insert(Feature feature);

  /** Une fonctionnalité non supprimée de la session. */
  Optional<Feature> find(SessionId sessionId, UUID featureId, MethodDefinition method);

  /** Les fonctionnalités non supprimées de la session, par identifiant croissant. */
  List<Feature> listActive(SessionId sessionId, MethodDefinition method);

  /**
   * Enregistre la fonctionnalité, qui doit être à la version de {@code feature.version()} en base.
   *
   * @return faux si la version en base a changé entre-temps (rien n'est écrit)
   */
  boolean update(Feature feature);

  /** Vrai si un autre identifiant métier, sans tenir compte de la casse, existe déjà. */
  boolean externalIdTaken(SessionId sessionId, String externalId, UUID exceptFeatureId);
}
