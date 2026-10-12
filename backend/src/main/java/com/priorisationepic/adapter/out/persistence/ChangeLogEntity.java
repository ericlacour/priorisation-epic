package com.priorisationepic.adapter.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.ColumnTransformer;

/** Ligne de {@code change_log}. Les colonnes JSON sont écrites en {@code jsonb}. */
@Entity
@Table(name = "change_log")
class ChangeLogEntity {

  @Id private UUID id;

  @Column(name = "session_id", nullable = false)
  private String sessionId;

  @Column(name = "at", nullable = false)
  private Instant at;

  @Column(name = "author_pseudo", nullable = false)
  private String authorPseudo;

  @Column(name = "entity_type", nullable = false)
  private String entityType;

  @Column(name = "entity_id", nullable = false)
  private String entityId;

  @Column(name = "action", nullable = false)
  private String action;

  @Column(name = "field")
  private String field;

  @Column(name = "old_value", columnDefinition = "jsonb")
  @ColumnTransformer(write = "?::jsonb")
  private String oldValue;

  @Column(name = "new_value", columnDefinition = "jsonb")
  @ColumnTransformer(write = "?::jsonb")
  private String newValue;

  protected ChangeLogEntity() {}

  ChangeLogEntity(
      UUID id,
      String sessionId,
      Instant at,
      String authorPseudo,
      String entityType,
      String entityId,
      String action,
      String field,
      String oldValue,
      String newValue) {
    this.id = id;
    this.sessionId = sessionId;
    this.at = at;
    this.authorPseudo = authorPseudo;
    this.entityType = entityType;
    this.entityId = entityId;
    this.action = action;
    this.field = field;
    this.oldValue = oldValue;
    this.newValue = newValue;
  }
}
