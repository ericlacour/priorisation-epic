package com.priorisationepic.application;

import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.method.MethodDefinition;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Accès aux fonctionnalités d'une session. Les valeurs de critères sont rangées par clé de critère
 * (FR-017b) : la définition de la méthode sert à les relire. Les fonctionnalités supprimées
 * (suppression douce) restent en base pour l'historique mais ne sont jamais renvoyées.
 */
public interface FeatureRepository {

  /** Nombre de fonctionnalités non supprimées de la session. */
  int countActive(SessionId sessionId);

  List<Feature> findActive(SessionId sessionId, MethodDefinition definition);

  Optional<Feature> findActive(SessionId sessionId, UUID featureId, MethodDefinition definition);

  /** Vrai si une autre fonctionnalité non supprimée porte cette clé d'identifiant. */
  boolean externalKeyTaken(SessionId sessionId, String externalKey, UUID exceptFeatureId);

  /** Enregistre une nouvelle fonctionnalité et ses valeurs ; sa version vaut 0. */
  void insert(Feature feature);

  /**
   * Remplace la fonctionnalité et ses valeurs, et passe sa version à {@code feature.version() + 1}.
   *
   * @throws StaleWriteException si la version enregistrée n'est plus {@code feature.version()}
   */
  void update(Feature feature);

  /**
   * Suppression douce.
   *
   * @throws StaleWriteException si la version enregistrée n'est plus {@code expectedVersion}
   */
  void softDelete(UUID featureId, Instant at, long expectedVersion);
}
