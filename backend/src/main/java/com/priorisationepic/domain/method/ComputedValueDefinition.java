package com.priorisationepic.domain.method;

import java.util.Objects;

/** Une valeur calculée d'une méthode (en WSJF : CoD et WSJF), jamais saisie. */
public record ComputedValueDefinition(
    String key, String code, String label, String definition, String header, Display display) {

  public ComputedValueDefinition {
    Objects.requireNonNull(key, "key");
    Objects.requireNonNull(code, "code");
    Objects.requireNonNull(label, "label");
    Objects.requireNonNull(definition, "definition");
    Objects.requireNonNull(header, "header");
    Objects.requireNonNull(display, "display");
  }
}
