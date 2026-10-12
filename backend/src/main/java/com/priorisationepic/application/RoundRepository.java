package com.priorisationepic.application;

import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.round.Vote;
import com.priorisationepic.domain.round.VotingRound;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/** Accès aux tours de vote d'une session et à leurs votes. */
public interface RoundRepository {

  /** Vrai si la session a un tour {@code OPEN}. */
  boolean hasOpenRound(SessionId sessionId);

  /** Tous les tours de la session, par numéro croissant. */
  List<VotingRound> findAll(SessionId sessionId);

  Optional<VotingRound> find(SessionId sessionId, UUID roundId);

  /** Le numéro du prochain tour de la session (1 pour le premier). */
  int nextNumber(SessionId sessionId);

  /** Les fonctionnalités qui sont dans un tour {@code OPEN} de la session. */
  Set<UUID> featuresInOpenRounds(SessionId sessionId);

  /** Enregistre un nouveau tour et ses fonctionnalités. */
  void insert(VotingRound round);

  /** Passe le tour à {@code REVEALED}. */
  void markRevealed(UUID roundId, Instant at);

  /**
   * Enregistre le vote d'un participant sur une fonctionnalité du tour, en remplaçant le précédent.
   * Un vote sans aucune valeur supprime le vote.
   */
  void saveVote(Vote vote);

  /** Tous les votes de tous les tours de la session. */
  List<Vote> findVotes(SessionId sessionId);
}
