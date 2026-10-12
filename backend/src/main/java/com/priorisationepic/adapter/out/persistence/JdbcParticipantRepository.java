package com.priorisationepic.adapter.out.persistence;

import com.priorisationepic.application.ParticipantRepository;
import com.priorisationepic.domain.ParticipantIdentity;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.Role;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.Tokens;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Lecture des participants en SQL : seule l'empreinte du jeton est comparée, en temps constant. */
@Repository
class JdbcParticipantRepository implements ParticipantRepository {

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
        .param("at", java.sql.Timestamp.from(at))
        .param("id", participantId)
        .update();
  }
}
