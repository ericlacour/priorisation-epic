package com.priorisationepic.application;

import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.method.MethodDefinition;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Dépôt de fonctionnalités en mémoire pour les tests de cas d'usage. */
public final class InMemoryFeatureRepository implements FeatureRepository {

  public final Map<UUID, Feature> features = new LinkedHashMap<>();

  @Override
  public int countActive(SessionId sessionId) {
    return findAllActive(sessionId).size();
  }

  @Override
  public List<Feature> findActive(SessionId sessionId, MethodDefinition definition) {
    return findAllActive(sessionId);
  }

  @Override
  public Optional<Feature> findActive(
      SessionId sessionId, UUID featureId, MethodDefinition definition) {
    return findAllActive(sessionId).stream().filter(f -> f.id().equals(featureId)).findFirst();
  }

  @Override
  public boolean externalKeyTaken(SessionId sessionId, String externalKey, UUID exceptFeatureId) {
    return findAllActive(sessionId).stream()
        .anyMatch(f -> f.externalKey().equals(externalKey) && !f.id().equals(exceptFeatureId));
  }

  @Override
  public void insert(Feature feature) {
    features.put(feature.id(), feature.withVersion(0));
  }

  @Override
  public void update(Feature feature) {
    Feature stored = features.get(feature.id());
    if (stored == null || stored.isDeleted() || stored.version() != feature.version()) {
      throw new StaleWriteException();
    }
    features.put(feature.id(), feature.withVersion(feature.version() + 1));
  }

  @Override
  public void softDelete(UUID featureId, Instant at, long expectedVersion) {
    Feature stored = features.get(featureId);
    if (stored == null || stored.isDeleted() || stored.version() != expectedVersion) {
      throw new StaleWriteException();
    }
    features.put(featureId, stored.delete(at).withVersion(expectedVersion + 1));
  }

  private List<Feature> findAllActive(SessionId sessionId) {
    return new ArrayList<>(
        features.values().stream()
            .filter(f -> f.sessionId().equals(sessionId) && !f.isDeleted())
            .toList());
  }
}
