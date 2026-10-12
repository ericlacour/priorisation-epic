package com.priorisationepic.domain.round;

import com.priorisationepic.domain.method.MethodDefinition;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Résultats d'un tour révélé (FR-020, FR-021), calculés sur les seules valeurs saisies : un critère
 * « sans avis » est ignoré, et un critère sans aucune valeur a un minimum, un maximum et une valeur
 * unanime vides. Rien n'y est propre à une méthode : les critères viennent de sa définition.
 */
public final class RoundResults {

  /** Un critère est en écart important quand maximum moins minimum dépasse strictement ce seuil. */
  public static final int LARGE_SPREAD_THRESHOLD = 3;

  private RoundResults() {}

  /**
   * Les résultats d'une fonctionnalité du tour.
   *
   * @param votes un vote par participant qui a donné au moins une valeur
   * @param nonVoters les participants sans aucune valeur sur cette fonctionnalité
   * @param min minimum par clé de critère, nul si personne n'a donné de valeur
   * @param max maximum par clé de critère, nul si personne n'a donné de valeur
   * @param largeSpread les critères dont l'écart dépasse {@value #LARGE_SPREAD_THRESHOLD}
   * @param unanimous la valeur commune d'un critère si tous ceux qui en ont donné une ont saisi la
   *     même, nul sinon
   */
  public record FeatureResult(
      UUID featureId,
      List<Vote> votes,
      List<UUID> nonVoters,
      Map<String, Integer> min,
      Map<String, Integer> max,
      List<String> largeSpread,
      Map<String, Integer> unanimous) {}

  /**
   * @param votes les votes de la fonctionnalité (ceux sans valeur sont ignorés)
   * @param participantIds les participants inscrits au moment de la révélation, animateur compris
   */
  public static FeatureResult of(
      MethodDefinition method,
      UUID featureId,
      Collection<Vote> votes,
      Collection<UUID> participantIds) {
    List<Vote> scored = votes.stream().filter(Vote::scored).toList();
    Map<String, Integer> min = new LinkedHashMap<>();
    Map<String, Integer> max = new LinkedHashMap<>();
    Map<String, Integer> unanimous = new LinkedHashMap<>();
    List<String> largeSpread = new ArrayList<>();
    for (String key : method.criterionKeys()) {
      List<Integer> given =
          scored.stream().map(v -> v.values().get(key)).filter(java.util.Objects::nonNull).toList();
      Integer low = given.stream().min(Integer::compare).orElse(null);
      Integer high = given.stream().max(Integer::compare).orElse(null);
      min.put(key, low);
      max.put(key, high);
      unanimous.put(key, low != null && low.equals(high) ? low : null);
      if (low != null && high - low > LARGE_SPREAD_THRESHOLD) {
        largeSpread.add(key);
      }
    }
    List<UUID> voters = scored.stream().map(Vote::participantId).toList();
    List<UUID> nonVoters = participantIds.stream().filter(id -> !voters.contains(id)).toList();
    return new FeatureResult(featureId, scored, nonVoters, min, max, largeSpread, unanimous);
  }

  /** Le nombre de fonctionnalités notées par chaque participant (FR-019). */
  public static int completedCount(UUID participantId, Collection<Vote> votes) {
    return (int)
        votes.stream().filter(v -> v.participantId().equals(participantId) && v.scored()).count();
  }
}
