package com.priorisationepic.application;

import com.priorisationepic.domain.method.PrioritizationMethod;
import com.priorisationepic.domain.scale.Scale;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Ce que la lecture d'un fichier doit savoir de la session : sa méthode (colonnes et calcul), son
 * échelle, les identifiants déjà utilisés, et si l'échelle d'un export JSON peut remplacer la
 * sienne (session en préparation et sans fonctionnalité).
 */
public record ImportContext(
    PrioritizationMethod method,
    Scale scale,
    Set<String> takenExternalIds,
    boolean scaleReplaceable) {

  public ImportContext {
    takenExternalIds =
        takenExternalIds.stream()
            .map(id -> id.toLowerCase(Locale.ROOT))
            .collect(Collectors.toUnmodifiableSet());
  }

  /** Vrai si l'identifiant, sans tenir compte de la casse, est déjà utilisé dans la session. */
  public boolean isTaken(String externalId) {
    return takenExternalIds.contains(externalId.toLowerCase(Locale.ROOT));
  }
}
