package com.priorisationepic.adapter.out.persistence;

import com.priorisationepic.application.ImportPreview;
import com.priorisationepic.application.ImportPreviewRepository;
import com.priorisationepic.application.StoredImportPreview;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.domain.scale.ScaleType;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/** Les aperçus d'import en SQL ; lignes, rejets et avertissements en JSON. */
@Repository
class JdbcImportPreviewRepository implements ImportPreviewRepository {

  private static final TypeReference<List<ImportPreview.Row>> ROWS = new TypeReference<>() {};
  private static final TypeReference<List<ImportPreview.Rejected>> REJECTED =
      new TypeReference<>() {};
  private static final TypeReference<List<ImportPreview.Warning>> WARNINGS =
      new TypeReference<>() {};
  private static final TypeReference<List<String>> STRINGS = new TypeReference<>() {};

  private final JdbcClient jdbc;
  private final JsonMapper json;

  JdbcImportPreviewRepository(JdbcClient jdbc) {
    this.jdbc = jdbc;
    // Copie locale : ce stockage ne dépend pas des réglages du mapper des échanges.
    this.json = JsonMapper.builder().build();
  }

  @Override
  public void insert(StoredImportPreview stored) {
    ImportPreview preview = stored.preview();
    Scale scale = preview.scale();
    jdbc.sql(
            "insert into import_preview (id, session_id, source_type, valid_rows, rejected_rows,"
                + " warnings, ignored_columns, scale_type, scale_max, expires_at) values (:id,"
                + " :sessionId, :sourceType, cast(:valid as jsonb), cast(:rejected as jsonb),"
                + " cast(:warnings as jsonb), cast(:ignored as jsonb), :scaleType, :scaleMax,"
                + " :expiresAt)")
        .param("id", stored.id())
        .param("sessionId", stored.sessionId().value())
        .param("sourceType", preview.sourceType().name())
        .param("valid", json.writeValueAsString(preview.validRows()))
        .param("rejected", json.writeValueAsString(preview.rejectedRows()))
        .param("warnings", json.writeValueAsString(preview.warnings()))
        .param("ignored", json.writeValueAsString(preview.ignoredColumns()))
        .param("scaleType", scale == null ? null : scale.type().name())
        .param("scaleMax", scale == null ? null : scale.max())
        .param("expiresAt", Timestamp.from(stored.expiresAt()))
        .update();
  }

  @Override
  public Optional<StoredImportPreview> find(SessionId sessionId, UUID previewId, Instant now) {
    return jdbc.sql(
            "select id, source_type, valid_rows, rejected_rows, warnings, ignored_columns,"
                + " scale_type, scale_max, expires_at from import_preview where id = :id and"
                + " session_id = :sessionId and expires_at > :now")
        .param("id", previewId)
        .param("sessionId", sessionId.value())
        .param("now", Timestamp.from(now))
        .query((rs, row) -> stored(sessionId, rs))
        .optional();
  }

  private StoredImportPreview stored(SessionId sessionId, ResultSet rs) throws SQLException {
    String scaleType = rs.getString("scale_type");
    Scale scale =
        scaleType == null ? null : new Scale(ScaleType.valueOf(scaleType), rs.getInt("scale_max"));
    ImportPreview preview =
        new ImportPreview(
            ImportPreview.SourceType.valueOf(rs.getString("source_type")),
            json.readValue(rs.getString("valid_rows"), ROWS),
            json.readValue(rs.getString("rejected_rows"), REJECTED),
            json.readValue(rs.getString("warnings"), WARNINGS),
            json.readValue(rs.getString("ignored_columns"), STRINGS),
            scale);
    return new StoredImportPreview(
        rs.getObject("id", UUID.class),
        sessionId,
        preview,
        rs.getTimestamp("expires_at").toInstant());
  }

  @Override
  public void delete(UUID previewId) {
    jdbc.sql("delete from import_preview where id = :id").param("id", previewId).update();
  }

  @Override
  public int deleteExpired(Instant now) {
    return jdbc.sql("delete from import_preview where expires_at <= :now")
        .param("now", Timestamp.from(now))
        .update();
  }
}
