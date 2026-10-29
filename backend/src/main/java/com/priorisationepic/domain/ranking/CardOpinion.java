package com.priorisationepic.domain.ranking;

import java.util.Objects;
import java.util.UUID;

/**
 * L'avis d'un membre sur une fonctionnalité, pour un critère, avec un commentaire facultatif
 * ({@code null} : aucun).
 */
public record CardOpinion(
    UUID featureId, String criterionKey, UUID participantId, Opinion opinion, String comment) {

  public CardOpinion {
    Objects.requireNonNull(featureId, "featureId");
    Objects.requireNonNull(criterionKey, "criterionKey");
    Objects.requireNonNull(participantId, "participantId");
    Objects.requireNonNull(opinion, "opinion");
  }
}
