package com.priorisationepic.adapter.out.persistence;

import com.priorisationepic.application.RoundRepository;
import com.priorisationepic.domain.SessionId;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Lecture des tours de vote en SQL. */
@Repository
class JdbcRoundRepository implements RoundRepository {

  private final JdbcClient jdbc;

  JdbcRoundRepository(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public boolean hasOpenRound(SessionId sessionId) {
    return jdbc.sql("select count(*) from voting_round where session_id = :id and status = 'OPEN'")
            .param("id", sessionId.value())
            .query(Integer.class)
            .single()
        > 0;
  }
}
