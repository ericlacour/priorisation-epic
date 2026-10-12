package com.priorisationepic.adapter.out.persistence;

import com.priorisationepic.application.SessionRepository;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.Tokens;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Lecture des sessions en SQL. */
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
}
