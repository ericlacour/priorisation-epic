package com.priorisationepic.adapter.out.persistence;

import com.priorisationepic.application.SessionRepository;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.SessionStatus;
import com.priorisationepic.domain.Tokens;
import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.domain.scale.ScaleType;
import java.sql.Timestamp;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Les sessions en SQL. */
@Repository
class JdbcSessionRepository implements SessionRepository {

  private final JdbcClient jdbc;

  JdbcSessionRepository(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public boolean exists(SessionId sessionId) {
    return jdbc.sql("select count(*) from session where session_id = :id")
            .param("id", sessionId.value())
            .query(Integer.class)
            .single()
        > 0;
  }

  @Override
  public boolean animationTokenMatches(SessionId sessionId, String animationToken) {
    return jdbc.sql("select animation_token_hash from session where session_id = :id")
        .param("id", sessionId.value())
        .query(String.class)
        .optional()
        .map(hash -> Tokens.matches(animationToken, hash))
        .orElse(false);
  }

  @Override
  public void insert(Session session, String animationTokenHash) {
    jdbc.sql(
            "insert into session (session_id, animation_token_hash, name, status, method,"
                + " method_version, scale_type, scale_max, created_at, created_by_pseudo, version)"
                + " values (:id, :hash, :name, :status, :method, :methodVersion, :scaleType,"
                + " :scaleMax, :createdAt, :createdBy, :version)")
        .param("id", session.id().value())
        .param("hash", animationTokenHash)
        .param("name", session.name())
        .param("status", session.status().name())
        .param("method", session.method())
        .param("methodVersion", session.methodVersion())
        .param("scaleType", session.scale().type().name())
        .param("scaleMax", session.scale().max())
        .param("createdAt", Timestamp.from(session.createdAt()))
        .param("createdBy", session.createdBy().value())
        .param("version", session.version())
        .update();
  }

  @Override
  public Optional<Session> find(SessionId sessionId) {
    return jdbc.sql(
            "select name, status, method, method_version, scale_type, scale_max, created_at,"
                + " created_by_pseudo, version from session where session_id = :id")
        .param("id", sessionId.value())
        .query(
            (rs, row) ->
                new Session(
                    sessionId,
                    rs.getString("name"),
                    SessionStatus.valueOf(rs.getString("status")),
                    rs.getString("method"),
                    rs.getInt("method_version"),
                    new Scale(
                        ScaleType.valueOf(rs.getString("scale_type")), rs.getInt("scale_max")),
                    rs.getTimestamp("created_at").toInstant(),
                    Pseudo.of(rs.getString("created_by_pseudo")),
                    rs.getInt("version")))
        .optional();
  }

  @Override
  public void incrementVersion(SessionId sessionId) {
    jdbc.sql("update session set version = version + 1 where session_id = :id")
        .param("id", sessionId.value())
        .update();
  }
}
