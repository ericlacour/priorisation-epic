package com.priorisationepic.domain.ranking;

import java.util.Objects;
import java.util.UUID;

/**
 * L'avis d'un membre sur une fonctionnalité, pour un critère, avec un commentaire facultatif
 * ({@code null} : aucun) et, pour « Je monterais » ou « Je descendrais », la valeur souhaitée
 * ({@code null} : aucune).
 */
public record CardOpinion(
    UUID featureId,
    String criterionKey,
    UUID participantId,
    Opinion opinion,
    String comment,
    Integer value) {

  public CardOpinion {
    Objects.requireNonNull(featureId, "featureId");
    Objects.requireNonNull(criterionKey, "criterionKey");
    Objects.requireNonNull(participantId, "participantId");
    Objects.requireNonNull(opinion, "opinion");
    if (value != null && opinion == Opinion.AGREE) {
      throw new IllegalArgumentException("value");
    }
  }
}
