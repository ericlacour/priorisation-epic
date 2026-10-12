package com.priorisationepic.domain.round;

import com.priorisationepic.domain.method.RankedFeature;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Règles de masquage du vote pour un destinataire (FR-019, FR-019a, SC-004), appliquées à chaque
 * état envoyé, aux réponses REST et aux exports. Pendant un tour ouvert :
 *
 * <ul>
 *   <li>chacun ne voit que ses propres votes, jamais ceux des autres ni les résultats ;
 *   <li>un non-animateur ne voit, pour les fonctionnalités du tour, ni valeurs retenues, ni score,
 *       et elles passent en fin de tableau ; l'animateur voit les valeurs retenues ;
 *   <li>la progression de chacun reste visible.
 * </ul>
 *
 * Une fois le tour révélé, tout est visible par tous.
 */
public final class Visibility {

  private final boolean facilitator;
  private final UUID recipientId;
  private final Set<UUID> featuresInOpenRounds;

  /**
   * @param recipientId le destinataire, nul pour la consultation sans participant (REST)
   * @param featuresInOpenRounds les fonctionnalités de tous les tours ouverts
   */
  public Visibility(boolean facilitator, UUID recipientId, Set<UUID> featuresInOpenRounds) {
    this.facilitator = facilitator;
    this.recipientId = recipientId;
    this.featuresInOpenRounds = Set.copyOf(featuresInOpenRounds);
  }

  /** Vrai si les valeurs retenues et le score de la fonctionnalité sont masqués au destinataire. */
  public boolean masks(UUID featureId) {
    return !facilitator && featuresInOpenRounds.contains(featureId);
  }

  /** Vrai si la fonctionnalité est dans un tour ouvert (marqueur « vote en cours »). */
  public boolean votingInProgress(UUID featureId) {
    return featuresInOpenRounds.contains(featureId);
  }

  /** Vrai si le destinataire voit ce vote : le sien pendant le tour, tous une fois révélé. */
  public boolean sees(Vote vote, VotingRound round) {
    return !round.isOpen() || vote.participantId().equals(recipientId);
  }

  /** Vrai si les résultats du tour sont visibles : jamais avant la révélation. */
  public boolean seesResults(VotingRound round) {
    return !round.isOpen();
  }

  /**
   * Vrai si le destinataire voit les votes déjà révélés de cette fonctionnalité : pas ceux des
   * tours précédents tant qu'elle est de nouveau en vote (FR-019a).
   */
  public boolean seesRevealedVotesOf(UUID featureId) {
    return !masks(featureId);
  }

  /** Place en fin de tableau, dans leur ordre, les fonctionnalités masquées au destinataire. */
  public List<RankedFeature> arrange(List<RankedFeature> ranked) {
    List<RankedFeature> visible = new ArrayList<>();
    List<RankedFeature> masked = new ArrayList<>();
    for (RankedFeature item : ranked) {
      (masks(item.feature().id()) ? masked : visible).add(item);
    }
    visible.addAll(masked);
    return List.copyOf(visible);
  }
}
