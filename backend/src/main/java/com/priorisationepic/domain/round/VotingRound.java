package com.priorisationepic.domain.round;

import com.priorisationepic.domain.SessionId;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Un tour de vote masqué (FR-018 à FR-022) sur une sélection de fonctionnalités. {@code OPEN →
 * REVEALED} est la seule transition ; un tour révélé est immuable. Un tour relancé garde le numéro
 * du tour dont il découle dans {@code previousRoundId}.
 *
 * @param featureIds les fonctionnalités du tour, dans l'ordre de la sélection, sans doublon
 */
public record VotingRound(
    UUID id,
    SessionId sessionId,
    int number,
    RoundStatus status,
    UUID previousRoundId,
    List<UUID> featureIds,
    Instant openedAt,
    Instant revealedAt) {

  public VotingRound {
    Objects.requireNonNull(id, "id");
    Objects.requireNonNull(sessionId, "sessionId");
    Objects.requireNonNull(status, "status");
    Objects.requireNonNull(openedAt, "openedAt");
    if (number < 1) {
      throw new InvalidRoundException("Le numéro de tour commence à 1");
    }
    featureIds = List.copyOf(featureIds);
    if (featureIds.isEmpty()) {
      throw new InvalidRoundException("Un tour contient au moins une fonctionnalité");
    }
    if (new LinkedHashSet<>(featureIds).size() != featureIds.size()) {
      throw new InvalidRoundException(
          "Une fonctionnalité ne peut figurer qu'une fois dans un tour");
    }
  }

  /** Ouvre un tour ; {@code previousRoundId} est nul pour un premier tour. */
  public static VotingRound open(
      UUID id,
      SessionId sessionId,
      int number,
      List<UUID> featureIds,
      UUID previousRoundId,
      Instant now) {
    return new VotingRound(
        id, sessionId, number, RoundStatus.OPEN, previousRoundId, featureIds, now, null);
  }

  public boolean isOpen() {
    return status == RoundStatus.OPEN;
  }

  public boolean contains(UUID featureId) {
    return featureIds.contains(featureId);
  }

  /**
   * {@code OPEN → REVEALED}.
   *
   * @throws RoundRevealedException si le tour est déjà révélé
   */
  public VotingRound reveal(Instant at) {
    ensureOpen();
    return new VotingRound(
        id, sessionId, number, RoundStatus.REVEALED, previousRoundId, featureIds, openedAt, at);
  }

  /**
   * @throws RoundRevealedException si le tour est révélé
   */
  public void ensureOpen() {
    if (!isOpen()) {
      throw new RoundRevealedException();
    }
  }
}
