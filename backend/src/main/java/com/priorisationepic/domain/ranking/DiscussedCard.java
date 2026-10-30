package com.priorisationepic.domain.ranking;

import java.util.Objects;
import java.util.UUID;

/**
 * Une carte dont la discussion est terminée, pour un critère (FR-015c) : son écart d'avis ne se
 * signale plus, tant qu'aucun avis sur elle ne change.
 */
public record DiscussedCard(UUID featureId, String criterionKey) {

  public DiscussedCard {
    Objects.requireNonNull(featureId, "featureId");
    Objects.requireNonNull(criterionKey, "criterionKey");
  }
}
