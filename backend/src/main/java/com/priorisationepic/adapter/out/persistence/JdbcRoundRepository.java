package com.priorisationepic.adapter.out.persistence;

import com.priorisationepic.application.RoundRepository;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.round.RoundStatus;
import com.priorisationepic.domain.round.Vote;
import com.priorisationepic.domain.round.VotingRound;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Tours de vote et votes en SQL. Les valeurs d'un vote sont dans {@code vote_criterion_value}, une
 * ligne par critère renseigné : un critère « sans avis » n'a pas de ligne.
 */
@Repository
class JdbcRoundRepository implements RoundRepository {

  private static final String ROUND_COLUMNS =
      "id, session_id, number, status, previous_round_id, opened_at, revealed_at";

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
  public List<VotingRound> findAll(SessionId sessionId) {
    Map<UUID, List<UUID>> features = loadFeatures(sessionId, null);
    return jdbc.sql(
            "select " + ROUND_COLUMNS + " from voting_round where session_id = :id order by number")
        .param("id", sessionId.value())
        .query((rs, row) -> round(rs, features))
        .list();
  }

  @Override
  public Optional<VotingRound> find(SessionId sessionId, UUID roundId) {
    Map<UUID, List<UUID>> features = loadFeatures(sessionId, roundId);
    return jdbc.sql(
            "select "
                + ROUND_COLUMNS
                + " from voting_round where session_id = :session and id = :id")
        .param("session", sessionId.value())
        .param("id", roundId)
        .query((rs, row) -> round(rs, features))
        .optional();
  }

  @Override
  public int nextNumber(SessionId sessionId) {
    return jdbc.sql("select coalesce(max(number), 0) + 1 from voting_round where session_id = :id")
        .param("id", sessionId.value())
        .query(Integer.class)
        .single();
  }

  @Override
  public Set<UUID> featuresInOpenRounds(SessionId sessionId) {
    return new HashSet<>(
        jdbc.sql(
                "select rf.feature_id from round_feature rf"
                    + " join voting_round r on r.id = rf.round_id"
                    + " where r.session_id = :id and r.status = 'OPEN'")
            .param("id", sessionId.value())
            .query(UUID.class)
            .list());
  }

  @Override
  public void insert(VotingRound round) {
    jdbc.sql(
            "insert into voting_round (id, session_id, number, status, previous_round_id,"
                + " opened_at) values (:id, :session, :number, :status, :previous, :openedAt)")
        .param("id", round.id())
        .param("session", round.sessionId().value())
        .param("number", round.number())
        .param("status", round.status().name())
        .param("previous", round.previousRoundId())
        .param("openedAt", Timestamp.from(round.openedAt()))
        .update();
    for (UUID featureId : round.featureIds()) {
      jdbc.sql("insert into round_feature (round_id, feature_id) values (:round, :feature)")
          .param("round", round.id())
          .param("feature", featureId)
          .update();
    }
  }

  @Override
  public void markRevealed(UUID roundId, Instant at) {
    jdbc.sql("update voting_round set status = 'REVEALED', revealed_at = :at where id = :id")
        .param("at", Timestamp.from(at))
        .param("id", roundId)
        .update();
  }

  @Override
  public void saveVote(Vote vote) {
    jdbc.sql(
            "delete from vote where round_id = :round and feature_id = :feature"
                + " and participant_id = :participant")
        .param("round", vote.roundId())
        .param("feature", vote.featureId())
        .param("participant", vote.participantId())
        .update();
    if (!vote.scored()) {
      return;
    }
    UUID id = UUID.randomUUID();
    jdbc.sql(
            "insert into vote (id, round_id, feature_id, participant_id, updated_at)"
                + " values (:id, :round, :feature, :participant, :at)")
        .param("id", id)
        .param("round", vote.roundId())
        .param("feature", vote.featureId())
        .param("participant", vote.participantId())
        .param("at", Timestamp.from(vote.at()))
        .update();
    for (Map.Entry<String, Integer> value : vote.values().entrySet()) {
      jdbc.sql(
              "insert into vote_criterion_value (vote_id, criterion_key, value)"
                  + " values (:id, :key, :value)")
          .param("id", id)
          .param("key", value.getKey())
          .param("value", value.getValue())
          .update();
    }
  }

  @Override
  public List<Vote> findVotes(SessionId sessionId) {
    Map<UUID, Map<String, Integer>> values = new HashMap<>();
    jdbc.sql(
            "select v.vote_id, v.criterion_key, v.value from vote_criterion_value v"
                + " join vote on vote.id = v.vote_id"
                + " join voting_round r on r.id = vote.round_id where r.session_id = :id")
        .param("id", sessionId.value())
        .query(
            (RowCallbackHandler)
                rs ->
                    values
                        .computeIfAbsent(
                            rs.getObject("vote_id", UUID.class), k -> new LinkedHashMap<>())
                        .put(rs.getString("criterion_key"), rs.getInt("value")));
    return jdbc.sql(
            "select vote.id, vote.round_id, vote.feature_id, vote.participant_id, vote.updated_at"
                + " from vote join voting_round r on r.id = vote.round_id"
                + " where r.session_id = :id order by vote.updated_at, vote.id")
        .param("id", sessionId.value())
        .query(
            (rs, row) ->
                new Vote(
                    rs.getObject("round_id", UUID.class),
                    rs.getObject("feature_id", UUID.class),
                    rs.getObject("participant_id", UUID.class),
                    values.getOrDefault(rs.getObject("id", UUID.class), Map.of()),
                    rs.getTimestamp("updated_at").toInstant()))
        .list();
  }

  /** Les fonctionnalités de chaque tour de la session (ou d'un seul), dans l'ordre d'insertion. */
  private Map<UUID, List<UUID>> loadFeatures(SessionId sessionId, UUID roundId) {
    Map<UUID, List<UUID>> features = new HashMap<>();
    jdbc.sql(
            "select rf.round_id, rf.feature_id from round_feature rf"
                + " join voting_round r on r.id = rf.round_id"
                + " join feature f on f.id = rf.feature_id"
                + " where r.session_id = :session"
                + " and (cast(:round as uuid) is null or r.id = cast(:round as uuid))"
                + " order by lower(f.external_id), f.id")
        .param("session", sessionId.value())
        .param("round", roundId)
        .query(
            (RowCallbackHandler)
                rs ->
                    features
                        .computeIfAbsent(
                            rs.getObject("round_id", UUID.class), k -> new ArrayList<>())
                        .add(rs.getObject("feature_id", UUID.class)));
    return features;
  }

  private static VotingRound round(java.sql.ResultSet rs, Map<UUID, List<UUID>> features)
      throws java.sql.SQLException {
    UUID id = rs.getObject("id", UUID.class);
    Timestamp revealedAt = rs.getTimestamp("revealed_at");
    return new VotingRound(
        id,
        new SessionId(rs.getString("session_id")),
        rs.getInt("number"),
        RoundStatus.valueOf(rs.getString("status")),
        rs.getObject("previous_round_id", UUID.class),
        features.getOrDefault(id, List.of()),
        rs.getTimestamp("opened_at").toInstant(),
        revealedAt == null ? null : revealedAt.toInstant());
  }
}
