package com.priorisationepic.application;

import com.priorisationepic.domain.method.MethodDefinition;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Le {@code sessionState} d'un destinataire (contract/schemas/session-state.json), sérialisé tel
 * quel en JSON. Tout vient du domaine : aucune colonne, aucun critère n'est écrit en dur.
 */
public record SessionStateView(
    String type,
    int version,
    String sessionId,
    String name,
    String status,
    String method,
    int methodVersion,
    MethodDefinition methodDefinition,
    String formula,
    String tieBreakRule,
    ScaleView scale,
    MeView me,
    List<ParticipantView> participants,
    List<FeatureView> features) {

  public static final String TYPE = "sessionState";

  public record ScaleView(String type, int max, List<Integer> allowedValues) {}

  public record MeView(UUID participantId, String pseudo, String role) {}

  public record ParticipantView(
      UUID participantId, String pseudo, String role, String businessRole, boolean online) {}

  public record ExactValueView(long numerator, long denominator, String display) {}

  public record ScoreView(
      boolean complete,
      List<String> outOfScale,
      Map<String, ExactValueView> computed,
      String explanation,
      Integer rank) {}

  public record FeatureView(
      UUID id,
      String externalId,
      String title,
      String description,
      int version,
      boolean markedForReview,
      String reviewReason,
      boolean votingInProgress,
      Map<String, Integer> criteria,
      ScoreView score) {}
}
