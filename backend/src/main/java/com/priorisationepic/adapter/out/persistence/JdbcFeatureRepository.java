package com.priorisationepic.adapter.out.persistence;

import com.priorisationepic.application.FeatureRepository;
import com.priorisationepic.domain.SessionId;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Lecture des fonctionnalités en SQL. */
@Repository
class JdbcFeatureRepository implements FeatureRepository {

  private final JdbcClient jdbc;

  JdbcFeatureRepository(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public int countActive(SessionId sessionId) {
    return jdbc.sql("select count(*) from feature where session_id = :id and deleted_at is null")
        .param("id", sessionId.value())
        .query(Integer.class)
        .single();
  }
}
