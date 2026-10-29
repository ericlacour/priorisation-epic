package com.priorisationepic.adapter.out.persistence;

import com.priorisationepic.application.RoundRepository;
import com.priorisationepic.domain.SessionId;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
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

  @Override
  public Set<UUID> featuresInOpenRound(SessionId sessionId) {
    return new HashSet<>(
        jdbc.sql(
                "select rf.feature_id from round_feature rf"
                    + " join voting_round r on r.id = rf.round_id"
                    + " where r.session_id = :id and r.status = 'OPEN'")
            .param("id", sessionId.value())
            .query(UUID.class)
            .list());
  }
}
