package com.priorisationepic.domain.method;

import java.util.Objects;

/**
 * Un critère saisi d'une méthode. {@code key} est la clé technique, {@code code} le sigle affiché,
 * {@code header} l'en-tête de colonne à l'import et à l'export.
 */
public record CriterionDefinition(
    String key, String code, String label, String definition, String header) {

  public CriterionDefinition {
    Objects.requireNonNull(key, "key");
    Objects.requireNonNull(code, "code");
    Objects.requireNonNull(label, "label");
    Objects.requireNonNull(definition, "definition");
    Objects.requireNonNull(header, "header");
  }
}
