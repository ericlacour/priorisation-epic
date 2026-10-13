package com.priorisationepic.adapter.out.persistence;

import com.priorisationepic.application.ParticipantRepository;
import com.priorisationepic.application.PseudoTakenException;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.ParticipantIdentity;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.Role;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.Tokens;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Les participants en SQL. Le jeton n'est jamais lu ni écrit : seule son empreinte SHA-256,
 * cherchée par égalité en SQL.
 */
@Repository
class JdbcParticipantRepository implements ParticipantRepository {

  private static final String COLUMNS =
      "id, session_id, pseudo, role, business_role, participant_token_hash, joined_at, last_seen_at";

  private static final RowMapper<Participant> PARTICIPANT =
      (rs, row) ->
          new Participant(
              rs.getObject("id", UUID.class),
              new SessionId(rs.getString("session_id")),
              Pseudo.of(rs.getString("pseudo")),
              Role.valueOf(rs.getString("role")),
              rs.getString("business_role"),
              rs.getString("participant_token_hash"),
              rs.getTimestamp("joined_at").toInstant(),
              rs.getTimestamp("last_seen_at").toInstant());

  private final JdbcClient jdbc;

  JdbcParticipantRepository(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public Optional<ParticipantIdentity> findByToken(SessionId sessionId, String token) {
    return jdbc.sql(
            "select id, pseudo, role from participant"
                + " where session_id = :session and participant_token_hash = :hash")
        .param("session", sessionId.value())
        .param("hash", Tokens.hash(token))
        .query(
            (rs, row) ->
                new ParticipantIdentity(
                    rs.getObject("id", UUID.class),
                    Pseudo.of(rs.getString("pseudo")),
                    Role.valueOf(rs.getString("role"))))
        .optional();
  }

  @Override
  public void updateLastSeen(UUID participantId, Instant at) {
    jdbc.sql("update participant set last_seen_at = :at where id = :id")
        .param("at", Timestamp.from(at))
        .param("id", participantId)
        .update();
  }

  @Override
  public void insert(Participant participant) {
    try {
      jdbc.sql(
              "insert into participant ("
                  + COLUMNS
                  + ") values (:id, :session, :pseudo, :role,"
                  + " :businessRole, :hash, :joinedAt, :lastSeenAt)")
          .param("id", participant.id())
          .param("session", participant.sessionId().value())
          .param("pseudo", participant.pseudo().value())
          .param("role", participant.role().name())
          .param("businessRole", participant.businessRole())
          .param("hash", participant.tokenHash())
          .param("joinedAt", Timestamp.from(participant.joinedAt()))
          .param("lastSeenAt", Timestamp.from(participant.lastSeenAt()))
          .update();
    } catch (DuplicateKeyException e) {
      // Index unique (session, lower(pseudo)) : un autre processus a pris le pseudo.
      throw new PseudoTakenException();
    }
  }

  @Override
  public Optional<Participant> findByPseudo(SessionId sessionId, Pseudo pseudo) {
    return jdbc.sql(
            "select "
                + COLUMNS
                + " from participant"
                + " where session_id = :session and lower(pseudo) = lower(:pseudo)")
        .param("session", sessionId.value())
        .param("pseudo", pseudo.value())
        .query(PARTICIPANT)
        .optional();
  }

  @Override
  public Optional<Participant> findById(UUID participantId) {
    return jdbc.sql("select " + COLUMNS + " from participant where id = :id")
        .param("id", participantId)
        .query(PARTICIPANT)
        .optional();
  }

  @Override
  public List<Participant> list(SessionId sessionId) {
    return jdbc.sql(
            "select "
                + COLUMNS
                + " from participant where session_id = :session"
                + " order by joined_at, id")
        .param("session", sessionId.value())
        .query(PARTICIPANT)
        .list();
  }

  @Override
  public void replaceToken(UUID participantId, String tokenHash, Instant at) {
    jdbc.sql(
            "update participant set participant_token_hash = :hash, last_seen_at = :at"
                + " where id = :id")
        .param("hash", tokenHash)
        .param("at", Timestamp.from(at))
        .param("id", participantId)
        .update();
  }
}
