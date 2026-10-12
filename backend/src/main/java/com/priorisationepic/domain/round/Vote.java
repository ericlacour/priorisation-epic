package com.priorisationepic.domain.round;

import com.priorisationepic.domain.method.InvalidValueException;
import com.priorisationepic.domain.method.MethodDefinition;
import com.priorisationepic.domain.method.UnknownCriterionException;
import com.priorisationepic.domain.scale.Scale;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Le vote d'un participant sur une fonctionnalité d'un tour (FR-019) : des valeurs par clé de
 * critère. Un critère absent vaut « sans avis ». Un vote sans aucune valeur n'est pas un vote : le
 * participant n'a pas noté la fonctionnalité.
 */
public record Vote(
    UUID roundId, UUID featureId, UUID participantId, Map<String, Integer> values, Instant at) {

  public Vote {
    Objects.requireNonNull(roundId, "roundId");
    Objects.requireNonNull(featureId, "featureId");
    Objects.requireNonNull(participantId, "participantId");
    Objects.requireNonNull(at, "at");
    values = java.util.Collections.unmodifiableMap(new LinkedHashMap<>(values));
  }

  /**
   * Un vote dont toutes les valeurs sont contrôlées : clés connues de la méthode, valeurs dans
   * l'échelle courante. Les valeurs nulles (« sans avis ») sont écartées.
   *
   * @throws UnknownCriterionException clé de critère inconnue de la méthode
   * @throws InvalidValueException valeur hors de l'échelle
   */
  public static Vote cast(
      UUID roundId,
      UUID featureId,
      UUID participantId,
      Map<String, Integer> requested,
      MethodDefinition method,
      Scale scale,
      Instant at) {
    Map<String, Integer> values = new LinkedHashMap<>();
    for (Map.Entry<String, Integer> entry : requested.entrySet()) {
      if (!method.hasCriterion(entry.getKey())) {
        throw new UnknownCriterionException(entry.getKey());
      }
      Integer value = entry.getValue();
      if (value == null) {
        continue;
      }
      if (!scale.accepts(value)) {
        throw new InvalidValueException(
            "La valeur de " + entry.getKey() + " est hors de l'échelle (1 à " + scale.max() + ")");
      }
      values.put(entry.getKey(), value);
    }
    return new Vote(roundId, featureId, participantId, values, at);
  }

  /** Vrai si au moins un critère a une valeur : la fonctionnalité compte comme notée. */
  public boolean scored() {
    return !values.isEmpty();
  }
}
