package com.priorisationepic.adapter.out.persistence;

import com.priorisationepic.application.SessionNameTakenException;
import com.priorisationepic.application.SessionRepository;
import com.priorisationepic.application.SessionSummary;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.SessionStatus;
import com.priorisationepic.domain.Tokens;
import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.domain.scale.ScaleType;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Les sessions en SQL. */
@Repository
class JdbcSessionRepository implements SessionRepository {

  /** Index unique du nom de session (V5__session_name_unique.sql). */
  private static final String NAME_INDEX = "session_name_key_uq";

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
    try {
      jdbc.sql(
              "insert into session (session_id, animation_token_hash, name, name_key, status,"
                  + " method, method_version, scale_type, scale_max, created_at,"
                  + " created_by_pseudo, version)"
                  + " values (:id, :hash, :name, :nameKey, :status, :method, :methodVersion,"
                  + " :scaleType, :scaleMax, :createdAt, :createdBy, :version)")
          .param("id", session.id().value())
          .param("hash", animationTokenHash)
          .param("name", session.name())
          .param("nameKey", Session.nameKey(session.name()))
          .param("status", session.status().name())
          .param("method", session.method())
          .param("methodVersion", session.methodVersion())
          .param("scaleType", session.scale().type().name())
          .param("scaleMax", session.scale().max())
          .param("createdAt", Timestamp.from(session.createdAt()))
          .param("createdBy", session.createdBy().value())
          .param("version", session.version())
          .update();
    } catch (DuplicateKeyException e) {
      throw nameTakenOr(e);
    }
  }

  @Override
  public Optional<SessionId> findIdByNameKey(String nameKey) {
    return jdbc.sql("select session_id from session where name_key = :key")
        .param("key", nameKey)
        .query((rs, row) -> new SessionId(rs.getString("session_id")))
        .optional();
  }

  /** Une autre session a pris ce nom entre le contrôle et l'écriture ; toute autre clé remonte. */
  private static RuntimeException nameTakenOr(DuplicateKeyException e) {
    String message = e.getMessage();
    return message != null && message.contains(NAME_INDEX) ? new SessionNameTakenException() : e;
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

  @Override
  public void updateSettings(SessionId sessionId, String name, Scale scale) {
    try {
      jdbc.sql(
              "update session set name = :name, name_key = :nameKey, scale_type = :scaleType,"
                  + " scale_max = :scaleMax where session_id = :id")
          .param("id", sessionId.value())
          .param("name", name)
          .param("nameKey", Session.nameKey(name))
          .param("scaleType", scale.type().name())
          .param("scaleMax", scale.max())
          .update();
    } catch (DuplicateKeyException e) {
      throw nameTakenOr(e);
    }
  }

  @Override
  public void updateStatus(SessionId sessionId, SessionStatus status) {
    jdbc.sql("update session set status = :status where session_id = :id")
        .param("id", sessionId.value())
        .param("status", status.name())
        .update();
  }

  @Override
  public List<SessionSummary> listSummaries() {
    return jdbc.sql(
            "select s.session_id, s.name, s.status, s.method, s.method_version, s.created_at,"
                + " coalesce((select p.pseudo from participant p where p.session_id = s.session_id"
                + " and p.role = 'FACILITATOR' order by p.joined_at limit 1),"
                + " s.created_by_pseudo) as facilitator_pseudo"
                + " from session s order by s.created_at desc, s.session_id")
        .query(
            (rs, row) ->
                new SessionSummary(
                    new SessionId(rs.getString("session_id")),
                    rs.getString("name"),
                    rs.getString("facilitator_pseudo"),
                    rs.getTimestamp("created_at").toInstant(),
                    SessionStatus.valueOf(rs.getString("status")),
                    rs.getString("method"),
                    rs.getInt("method_version")))
        .list();
  }
}
