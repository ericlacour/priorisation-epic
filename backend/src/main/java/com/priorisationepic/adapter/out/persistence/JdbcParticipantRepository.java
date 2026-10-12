package com.priorisationepic.adapter.out.persistence;

import com.priorisationepic.application.ParticipantRepository;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.ParticipantIdentity;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.Role;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.Tokens;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Accès aux participants en SQL : seule l'empreinte du jeton est comparée, en temps constant. */
@Repository
class JdbcParticipantRepository implements ParticipantRepository {

  private static final String COLUMNS =
      "id, session_id, pseudo, role, business_role, participant_token_hash, joined_at,"
          + " last_seen_at";

  private final JdbcClient jdbc;

  JdbcParticipantRepository(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public Optional<ParticipantIdentity> findByToken(SessionId sessionId, String token) {
    String hash = Tokens.hash(token);
    return jdbc.sql(
            "select id, pseudo, role, participant_token_hash from participant"
                + " where session_id = :session and participant_token_hash = :hash")
        .param("session", sessionId.value())
        .param("hash", hash)
        .query(
            (rs, row) ->
                new Object[] {
                  rs.getObject("id", UUID.class),
                  rs.getString("pseudo"),
                  rs.getString("role"),
                  rs.getString("participant_token_hash")
                })
        .optional()
        .filter(columns -> Tokens.matches(token, (String) columns[3]))
        .map(
            columns ->
                new ParticipantIdentity(
                    (UUID) columns[0],
                    Pseudo.of((String) columns[1]),
                    Role.valueOf((String) columns[2])));
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
    jdbc.sql(
            "insert into participant (id, session_id, pseudo, role, business_role,"
                + " participant_token_hash, joined_at, last_seen_at)"
                + " values (:id, :session, :pseudo, :role, :businessRole, :hash, :joinedAt,"
                + " :lastSeenAt)")
        .param("id", participant.id())
        .param("session", participant.sessionId().value())
        .param("pseudo", participant.pseudo().value())
        .param("role", participant.role().name())
        .param("businessRole", participant.businessRole())
        .param("hash", participant.participantTokenHash())
        .param("joinedAt", Timestamp.from(participant.joinedAt()))
        .param("lastSeenAt", Timestamp.from(participant.lastSeenAt()))
        .update();
  }

  @Override
  public Optional<Participant> findByPseudo(SessionId sessionId, Pseudo pseudo) {
    return jdbc.sql(
            "select "
                + COLUMNS
                + " from participant where session_id = :session and lower(pseudo) = :key")
        .param("session", sessionId.value())
        .param("key", pseudo.uniquenessKey())
        .query(JdbcParticipantRepository::participant)
        .optional();
  }

  @Override
  public Optional<Participant> find(UUID participantId) {
    return jdbc.sql("select " + COLUMNS + " from participant where id = :id")
        .param("id", participantId)
        .query(JdbcParticipantRepository::participant)
        .optional();
  }

  @Override
  public List<Participant> findAll(SessionId sessionId) {
    return jdbc.sql(
            "select "
                + COLUMNS
                + " from participant where session_id = :session order by joined_at, id")
        .param("session", sessionId.value())
        .query(JdbcParticipantRepository::participant)
        .list();
  }

  @Override
  public void updateToken(Participant participant) {
    jdbc.sql(
            "update participant set participant_token_hash = :hash, last_seen_at = :lastSeenAt"
                + " where id = :id")
        .param("hash", participant.participantTokenHash())
        .param("lastSeenAt", Timestamp.from(participant.lastSeenAt()))
        .param("id", participant.id())
        .update();
  }

  @Override
  public void updateRole(UUID participantId, Role role) {
    jdbc.sql("update participant set role = :role where id = :id")
        .param("role", role.name())
        .param("id", participantId)
        .update();
  }

  private static Participant participant(ResultSet rs, int row) throws SQLException {
    return new Participant(
        rs.getObject("id", UUID.class),
        new SessionId(rs.getString("session_id")),
        Pseudo.of(rs.getString("pseudo")),
        Role.valueOf(rs.getString("role")),
        rs.getString("business_role"),
        rs.getString("participant_token_hash"),
        rs.getTimestamp("joined_at").toInstant(),
        rs.getTimestamp("last_seen_at").toInstant(),
        0);
  }
}
