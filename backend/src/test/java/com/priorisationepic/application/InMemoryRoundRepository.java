package com.priorisationepic.application;

import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.round.RoundStatus;
import com.priorisationepic.domain.round.Vote;
import com.priorisationepic.domain.round.VotingRound;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** Dépôt de tours et de votes en mémoire pour les tests de cas d'usage. */
public final class InMemoryRoundRepository implements RoundRepository {

  public final Map<UUID, VotingRound> rounds = new LinkedHashMap<>();
  public final List<Vote> votes = new ArrayList<>();

  @Override
  public boolean hasOpenRound(SessionId sessionId) {
    return rounds.values().stream().anyMatch(r -> r.sessionId().equals(sessionId) && r.isOpen());
  }

  @Override
  public List<VotingRound> findAll(SessionId sessionId) {
    return rounds.values().stream()
        .filter(r -> r.sessionId().equals(sessionId))
        .sorted(java.util.Comparator.comparingInt(VotingRound::number))
        .toList();
  }

  @Override
  public Optional<VotingRound> find(SessionId sessionId, UUID roundId) {
    return Optional.ofNullable(rounds.get(roundId)).filter(r -> r.sessionId().equals(sessionId));
  }

  @Override
  public int nextNumber(SessionId sessionId) {
    return findAll(sessionId).size() + 1;
  }

  @Override
  public Set<UUID> featuresInOpenRounds(SessionId sessionId) {
    return findAll(sessionId).stream()
        .filter(VotingRound::isOpen)
        .flatMap(r -> r.featureIds().stream())
        .collect(Collectors.toSet());
  }

  @Override
  public void insert(VotingRound round) {
    rounds.put(round.id(), round);
  }

  @Override
  public void markRevealed(UUID roundId, Instant at) {
    VotingRound round = rounds.get(roundId);
    rounds.put(
        roundId,
        new VotingRound(
            round.id(),
            round.sessionId(),
            round.number(),
            RoundStatus.REVEALED,
            round.previousRoundId(),
            round.featureIds(),
            round.openedAt(),
            at));
  }

  @Override
  public void saveVote(Vote vote) {
    votes.removeIf(
        v ->
            v.roundId().equals(vote.roundId())
                && v.featureId().equals(vote.featureId())
                && v.participantId().equals(vote.participantId()));
    if (vote.scored()) {
      votes.add(vote);
    }
  }

  @Override
  public List<Vote> findVotes(SessionId sessionId) {
    Set<UUID> mine = findAll(sessionId).stream().map(VotingRound::id).collect(Collectors.toSet());
    return votes.stream().filter(v -> mine.contains(v.roundId())).toList();
  }
}
