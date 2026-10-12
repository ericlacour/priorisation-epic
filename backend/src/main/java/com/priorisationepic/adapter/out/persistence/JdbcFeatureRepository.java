package com.priorisationepic.adapter.out.persistence;

import com.priorisationepic.application.FeatureRepository;
import com.priorisationepic.application.StaleWriteException;
import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.method.Criteria;
import com.priorisationepic.domain.method.MethodDefinition;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Accès aux fonctionnalités en SQL. Les valeurs de critères sont dans {@code
 * feature_criterion_value}, une ligne par critère renseigné : aucune colonne ne nomme un critère
 * (FR-017b).
 */
@Repository
class JdbcFeatureRepository implements FeatureRepository {

  private static final String COLUMNS =
      "id, session_id, external_id, title, description, marked_for_review, review_reason,"
          + " deleted_at, version";

  private final JdbcClient jdbc;

  JdbcFeatureRepository(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public int countActive(SessionId sessionId) {
    return jdbc.sql("select count(*) from feature where session_id = :id and deleted_at is null")
        .param("id", sessionId.value())
        .query(Integer.class)
        .single();
  }

  @Override
  public List<Feature> findActive(SessionId sessionId, MethodDefinition definition) {
    Map<UUID, Map<String, Integer>> values =
        loadValues(
            "select v.feature_id, v.criterion_key, v.value from feature_criterion_value v"
                + " join feature f on f.id = v.feature_id"
                + " where f.session_id = :id and f.deleted_at is null",
            sessionId.value());
    return jdbc.sql(
            "select "
                + COLUMNS
                + " from feature where session_id = :id and deleted_at is null"
                + " order by lower(external_id), id")
        .param("id", sessionId.value())
        .query((rs, row) -> feature(rs, definition, values))
        .list();
  }

  @Override
  public Optional<Feature> findActive(
      SessionId sessionId, UUID featureId, MethodDefinition definition) {
    Map<UUID, Map<String, Integer>> values =
        loadValues(
            "select feature_id, criterion_key, value from feature_criterion_value"
                + " where feature_id = :id",
            featureId);
    return jdbc.sql(
            "select "
                + COLUMNS
                + " from feature where id = :id and session_id = :session and deleted_at is null")
        .param("id", featureId)
        .param("session", sessionId.value())
        .query((rs, row) -> feature(rs, definition, values))
        .optional();
  }

  @Override
  public boolean externalKeyTaken(SessionId sessionId, String externalKey, UUID exceptFeatureId) {
    return jdbc.sql(
                "select count(*) from feature where session_id = :session"
                    + " and lower(external_id) = :key and deleted_at is null"
                    + " and (cast(:except as uuid) is null or id <> cast(:except as uuid))")
            .param("session", sessionId.value())
            .param("key", externalKey)
            .param("except", exceptFeatureId)
            .query(Integer.class)
            .single()
        > 0;
  }

  @Override
  public void insert(Feature feature) {
    jdbc.sql(
            "insert into feature (id, session_id, external_id, title, description,"
                + " marked_for_review, review_reason, version)"
                + " values (:id, :session, :externalId, :title, :description, :marked, :reason, 0)")
        .param("id", feature.id())
        .param("session", feature.sessionId().value())
        .param("externalId", feature.externalId())
        .param("title", feature.title())
        .param("description", emptyToNull(feature.description()))
        .param("marked", feature.markedForReview())
        .param("reason", feature.reviewReason())
        .update();
    writeValues(feature);
  }

  @Override
  public void update(Feature feature) {
    int rows =
        jdbc.sql(
                "update feature set external_id = :externalId, title = :title,"
                    + " description = :description, marked_for_review = :marked,"
                    + " review_reason = :reason, version = version + 1"
                    + " where id = :id and version = :version and deleted_at is null")
            .param("externalId", feature.externalId())
            .param("title", feature.title())
            .param("description", emptyToNull(feature.description()))
            .param("marked", feature.markedForReview())
            .param("reason", feature.reviewReason())
            .param("id", feature.id())
            .param("version", feature.version())
            .update();
    if (rows != 1) {
      throw new StaleWriteException();
    }
    jdbc.sql("delete from feature_criterion_value where feature_id = :id")
        .param("id", feature.id())
        .update();
    writeValues(feature);
  }

  @Override
  public void softDelete(UUID featureId, Instant at, long expectedVersion) {
    int rows =
        jdbc.sql(
                "update feature set deleted_at = :at, version = version + 1"
                    + " where id = :id and version = :version and deleted_at is null")
            .param("at", Timestamp.from(at))
            .param("id", featureId)
            .param("version", expectedVersion)
            .update();
    if (rows != 1) {
      throw new StaleWriteException();
    }
  }

  /**
   * Les valeurs de critères par fonctionnalité, lues par la requête (un seul paramètre {@code
   * :id}).
   */
  private Map<UUID, Map<String, Integer>> loadValues(String sql, Object id) {
    Map<UUID, Map<String, Integer>> values = new HashMap<>();
    jdbc.sql(sql)
        .param("id", id)
        .query(
            (RowCallbackHandler)
                rs ->
                    values
                        .computeIfAbsent(
                            rs.getObject("feature_id", UUID.class), k -> new HashMap<>())
                        .put(rs.getString("criterion_key"), rs.getInt("value")));
    return values;
  }

  private void writeValues(Feature feature) {
    for (Map.Entry<String, Integer> value : feature.criteria().values().entrySet()) {
      jdbc.sql(
              "insert into feature_criterion_value (feature_id, criterion_key, value)"
                  + " values (:id, :key, :value)")
          .param("id", feature.id())
          .param("key", value.getKey())
          .param("value", value.getValue())
          .update();
    }
  }

  private static Feature feature(
      ResultSet rs, MethodDefinition definition, Map<UUID, Map<String, Integer>> values)
      throws SQLException {
    UUID id = rs.getObject("id", UUID.class);
    Timestamp deletedAt = rs.getTimestamp("deleted_at");
    return new Feature(
        id,
        new SessionId(rs.getString("session_id")),
        rs.getString("external_id"),
        rs.getString("title"),
        rs.getString("description"),
        new Criteria(definition, new HashMap<>(values.getOrDefault(id, Map.of()))),
        rs.getBoolean("marked_for_review"),
        rs.getString("review_reason"),
        deletedAt == null ? null : deletedAt.toInstant(),
        rs.getLong("version"));
  }

  private static String emptyToNull(String text) {
    return text == null || text.isEmpty() ? null : text;
  }
}
