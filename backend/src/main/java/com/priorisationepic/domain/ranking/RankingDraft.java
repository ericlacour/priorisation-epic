package com.priorisationepic.domain.ranking;

import com.priorisationepic.domain.ranking.RankingRefusedException.Reason;
import com.priorisationepic.domain.scale.Scale;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Le brouillon de l'écran « Prioriser par classement » (FR-015a, étapes 2 à 4), tel que l'animateur
 * le diffuse (FR-015b). {@code levels} va du plus haut au plus bas niveau, les fonctionnalités d'un
 * niveau sont à égalité ; {@code unranked} attend dans « Non classées » ; {@code values} donne la
 * valeur de chaque fonctionnalité classée pour {@code criterionKey}. Une fonctionnalité apparaît au
 * plus une fois. Une valeur {@code null} est une absence de valeur.
 */
public record RankingDraft(
    List<String> criterionKeys,
    String criterionKey,
    List<List<UUID>> levels,
    List<UUID> unranked,
    Map<UUID, Integer> values) {

  public RankingDraft {
    Objects.requireNonNull(criterionKeys, "criterionKeys");
    Objects.requireNonNull(levels, "levels");
    Objects.requireNonNull(unranked, "unranked");
    Objects.requireNonNull(values, "values");
    criterionKeys = List.copyOf(criterionKeys);
    levels = levels.stream().map(List::copyOf).toList();
    unranked = List.copyOf(unranked);
    Map<UUID, Integer> present = new LinkedHashMap<>();
    values.forEach(
        (featureId, value) -> {
          if (value != null) {
            present.put(featureId, value);
          }
        });
    values = Map.copyOf(present);
    if (criterionKeys.isEmpty()
        || new HashSet<>(criterionKeys).size() != criterionKeys.size()
        || !criterionKeys.contains(criterionKey)
        || levels.stream().anyMatch(List::isEmpty)) {
      throw new RankingRefusedException(Reason.INVALID_DRAFT);
    }
    Set<UUID> seen = new HashSet<>();
    for (UUID featureId : concat(levels, unranked)) {
      if (!seen.add(featureId)) {
        throw new RankingRefusedException(Reason.DUPLICATE_FEATURE, featureId);
      }
    }
    Set<UUID> ranked = new HashSet<>();
    levels.forEach(ranked::addAll);
    for (Map.Entry<UUID, Integer> value : values.entrySet()) {
      if (!ranked.contains(value.getKey()) || value.getValue() < 1) {
        throw new RankingRefusedException(Reason.INVALID_DRAFT, value.getKey());
      }
    }
  }

  /** Toutes les fonctionnalités du brouillon, classées puis non classées. */
  public Set<UUID> features() {
    return new LinkedHashSet<>(concat(levels, unranked));
  }

  public boolean contains(UUID featureId) {
    return features().contains(featureId);
  }

  /** La fonctionnalité attend dans « Non classées » : elle n'a pas encore de place. */
  public boolean isUnranked(UUID featureId) {
    return unranked.contains(featureId);
  }

  /**
   * Vérifie le brouillon contre la session : critères de la méthode, valeurs de l'échelle,
   * fonctionnalités hors d'un tour de vote ouvert (FR-018).
   */
  public void requireAllowed(
      Collection<String> methodCriteria, Scale scale, Set<UUID> inOpenRound) {
    if (!methodCriteria.containsAll(criterionKeys)) {
      throw new RankingRefusedException(Reason.UNKNOWN_CRITERION);
    }
    for (Map.Entry<UUID, Integer> value : values.entrySet()) {
      if (!scale.accepts(value.getValue())) {
        throw new RankingRefusedException(Reason.VALUE_OUT_OF_SCALE, value.getKey());
      }
    }
    for (UUID featureId : features()) {
      if (inOpenRound.contains(featureId)) {
        throw new RankingRefusedException(Reason.FEATURE_IN_OPEN_ROUND, featureId);
      }
    }
  }

  /**
   * Le même brouillon, sans les fonctionnalités absentes de {@code existing} (supprimées
   * entre-temps) ; un niveau vidé disparaît.
   */
  public RankingDraft retainOnly(Set<UUID> existing) {
    List<List<UUID>> keptLevels =
        levels.stream()
            .map(level -> level.stream().filter(existing::contains).toList())
            .filter(level -> !level.isEmpty())
            .toList();
    Map<UUID, Integer> keptValues = new LinkedHashMap<>(values);
    keptValues.keySet().retainAll(existing);
    return new RankingDraft(
        criterionKeys,
        criterionKey,
        keptLevels,
        unranked.stream().filter(existing::contains).toList(),
        keptValues);
  }

  private static List<UUID> concat(List<List<UUID>> levels, List<UUID> unranked) {
    List<UUID> all = new ArrayList<>();
    levels.forEach(all::addAll);
    all.addAll(unranked);
    return all;
  }
}
