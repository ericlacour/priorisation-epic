package com.priorisationepic.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * Entrée d'historique (FR-025), enregistrée mais non affichée en V1. Seules deux opérations sont
 * tracées : la modification d'une valeur retenue et le changement d'échelle. {@code oldValue} et
 * {@code newValue} sont du JSON ({@code null} pour « aucune valeur »).
 */
public record ChangeLogEntry(
    UUID id,
    SessionId sessionId,
    Instant at,
    Pseudo author,
    EntityType entityType,
    String entityId,
    Action action,
    String field,
    String oldValue,
    String newValue) {

  /** Type de l'entité modifiée. */
  public enum EntityType {
    SESSION,
    FEATURE
  }

  /** Opération tracée. */
  public enum Action {
    VALUE_CHANGE,
    SCALE_CHANGE
  }

  public ChangeLogEntry {
    Objects.requireNonNull(id, "id");
    Objects.requireNonNull(sessionId, "sessionId");
    Objects.requireNonNull(at, "at");
    Objects.requireNonNull(author, "author");
    Objects.requireNonNull(entityType, "entityType");
    Objects.requireNonNull(entityId, "entityId");
    Objects.requireNonNull(action, "action");
  }
}
