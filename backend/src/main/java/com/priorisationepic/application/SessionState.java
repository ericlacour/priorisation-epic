package com.priorisationepic.application;

import com.priorisationepic.domain.method.MethodDefinition;
import java.math.BigInteger;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Le {@code sessionState} du contrat ({@code session-state.json}), tel qu'il est sérialisé en JSON.
 * Les noms des composants sont ceux du contrat ; rien n'y est propre à une méthode : les critères
 * et les valeurs calculées sont rangés par clé de {@code methodDefinition}.
 */
public record SessionState(
    String type,
    long version,
    String sessionId,
    String name,
    String status,
    String method,
    int methodVersion,
    MethodDefinition methodDefinition,
    String formula,
    String tieBreakRule,
    ScaleView scale,
    Me me,
    List<ParticipantView> participants,
    List<FeatureView> features,
    List<RoundView> openRounds,
    List<RoundView> lastRevealedRounds) {

  public record ScaleView(String type, int max, List<Integer> allowedValues) {}

  public record Me(UUID participantId, String pseudo, String role) {}

  public record ParticipantView(
      UUID participantId, String pseudo, String role, String businessRole, boolean online) {}

  public record FeatureView(
      UUID id,
      String externalId,
      String title,
      String description,
      long version,
      boolean markedForReview,
      String reviewReason,
      boolean votingInProgress,
      Map<String, Integer> criteria,
      ScoreView score) {}

  public record ScoreView(
      boolean complete,
      List<String> outOfScale,
      Map<String, ExactValue> computed,
      String explanation,
      Integer rank) {}

  public record ExactValue(BigInteger numerator, BigInteger denominator, String display) {}

  /** Un tour vu par un destinataire : ses votes à lui seul tant qu'il est ouvert (FR-019). */
  public record RoundView(
      UUID id,
      int number,
      String status,
      UUID previousRoundId,
      List<UUID> featureIds,
      List<ProgressView> progress,
      Map<UUID, Map<String, Integer>> myVotes,
      List<FeatureResultView> results) {}

  public record ProgressView(UUID participantId, int completedCount) {}

  public record FeatureResultView(
      UUID featureId,
      List<VoteView> votes,
      List<UUID> nonVoters,
      Map<String, Integer> min,
      Map<String, Integer> max,
      List<String> largeSpread,
      Map<String, Integer> unanimous) {}

  public record VoteView(UUID participantId, Map<String, Integer> criteria) {}
}
