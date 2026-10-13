package com.priorisationepic.adapter.out.persistence;

import com.priorisationepic.application.FeatureRepository;
import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.method.Criteria;
import com.priorisationepic.domain.method.MethodDefinition;
import java.sql.Timestamp;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Les fonctionnalités en SQL. Les valeurs sont rangées par clé de critère dans {@code
 * feature_criterion_value} : aucune colonne par critère. Verrouillage optimiste par {@code
 * version}.
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

  /** Une ligne de {@code feature}, avant d'y joindre ses valeurs. */
  private record Row(
      UUID id,
      String sessionId,
      String externalId,
      String title,
      String description,
      boolean marked,
      String reason,
      java.time.Instant deletedAt,
      int version) {}

  @Override
  public int countActive(SessionId sessionId) {
    return jdbc.sql("select count(*) from feature where session_id = :id and deleted_at is null")
        .param("id", sessionId.value())
        .query(Integer.class)
        .single();
  }

  @Override
  public void insert(Feature feature) {
    jdbc.sql(
            "insert into feature ("
                + COLUMNS
                + ") values (:id, :session, :externalId, :title,"
                + " :description, :marked, :reason, :deletedAt, :version)")
        .param("id", feature.id())
        .param("session", feature.sessionId().value())
        .param("externalId", feature.externalId())
        .param("title", feature.title())
        .param("description", feature.description())
        .param("marked", feature.markedForReview())
        .param("reason", feature.reviewReason())
        .param(
            "deletedAt", feature.deletedAt() == null ? null : Timestamp.from(feature.deletedAt()))
        .param("version", feature.version())
        .update();
    insertValues(feature);
  }

  @Override
  public Optional<Feature> find(SessionId sessionId, UUID featureId, MethodDefinition method) {
    return jdbc.sql(
            "select "
                + COLUMNS
                + " from feature"
                + " where id = :id and session_id = :session and deleted_at is null")
        .param("id", featureId)
        .param("session", sessionId.value())
        .query(JdbcFeatureRepository::row)
        .optional()
        .map(
            row ->
                toFeature(
                    row,
                    method,
                    valuesOf(
                            "select feature_id, criterion_key, value from feature_criterion_value"
                                + " where feature_id = :id",
                            "id",
                            featureId)
                        .getOrDefault(row.id(), Map.of())));
  }

  @Override
  public List<Feature> listActive(SessionId sessionId, MethodDefinition method) {
    List<Row> rows =
        jdbc.sql(
                "select "
                    + COLUMNS
                    + " from feature"
                    + " where session_id = :session and deleted_at is null"
                    + " order by lower(external_id), external_id")
            .param("session", sessionId.value())
            .query(JdbcFeatureRepository::row)
            .list();
    Map<UUID, Map<String, Integer>> values =
        valuesOf(
            "select v.feature_id, v.criterion_key, v.value from feature_criterion_value v"
                + " join feature f on f.id = v.feature_id"
                + " where f.session_id = :session and f.deleted_at is null",
            "session",
            sessionId.value());
    return rows.stream()
        .map(row -> toFeature(row, method, values.getOrDefault(row.id(), Map.of())))
        .toList();
  }

  @Override
  public boolean update(Feature feature) {
    int updated =
        jdbc.sql(
                "update feature set external_id = :externalId, title = :title,"
                    + " description = :description, marked_for_review = :marked,"
                    + " review_reason = :reason, deleted_at = :deletedAt, version = version + 1"
                    + " where id = :id and version = :version")
            .param("id", feature.id())
            .param("externalId", feature.externalId())
            .param("title", feature.title())
            .param("description", feature.description())
            .param("marked", feature.markedForReview())
            .param("reason", feature.reviewReason())
            .param(
                "deletedAt",
                feature.deletedAt() == null ? null : Timestamp.from(feature.deletedAt()))
            .param("version", feature.version())
            .update();
    if (updated == 0) {
      return false;
    }
    jdbc.sql("delete from feature_criterion_value where feature_id = :id")
        .param("id", feature.id())
        .update();
    insertValues(feature);
    return true;
  }

  @Override
  public boolean externalIdTaken(SessionId sessionId, String externalId, UUID exceptFeatureId) {
    return jdbc.sql(
                "select count(*) from feature where session_id = :session"
                    + " and lower(external_id) = lower(:externalId) and deleted_at is null"
                    + " and (cast(:except as uuid) is null or id <> cast(:except as uuid))")
            .param("session", sessionId.value())
            .param("externalId", externalId)
            .param("except", exceptFeatureId, java.sql.Types.OTHER)
            .query(Integer.class)
            .single()
        > 0;
  }

  private void insertValues(Feature feature) {
    for (Map.Entry<String, Integer> value : feature.criteria().asMap().entrySet()) {
      jdbc.sql(
              "insert into feature_criterion_value (feature_id, criterion_key, value)"
                  + " values (:feature, :key, :value)")
          .param("feature", feature.id())
          .param("key", value.getKey())
          .param("value", value.getValue())
          .update();
    }
  }

  private Map<UUID, Map<String, Integer>> valuesOf(String sql, String name, Object parameter) {
    Map<UUID, Map<String, Integer>> byFeature = new HashMap<>();
    jdbc.sql(sql)
        .param(name, parameter)
        .query(
            (rs, row) -> {
              byFeature
                  .computeIfAbsent(rs.getObject("feature_id", UUID.class), id -> new HashMap<>())
                  .put(rs.getString("criterion_key"), rs.getInt("value"));
              return null;
            })
        .list();
    return byFeature;
  }

  private static Row row(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
    Timestamp deletedAt = rs.getTimestamp("deleted_at");
    return new Row(
        rs.getObject("id", UUID.class),
        rs.getString("session_id"),
        rs.getString("external_id"),
        rs.getString("title"),
        rs.getString("description"),
        rs.getBoolean("marked_for_review"),
        rs.getString("review_reason"),
        deletedAt == null ? null : deletedAt.toInstant(),
        rs.getInt("version"));
  }

  private static Feature toFeature(Row row, MethodDefinition method, Map<String, Integer> values) {
    return new Feature(
        row.id(),
        new SessionId(row.sessionId()),
        row.externalId(),
        row.title(),
        row.description(),
        Criteria.of(method, values),
        row.marked(),
        row.reason(),
        row.deletedAt(),
        row.version());
  }
}
