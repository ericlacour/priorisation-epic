package com.priorisationepic.domain.method;

/** Une valeur calculée par la méthode, avec son mode d'affichage. */
public record ComputedValueDefinition(
    String key, String code, String label, String definition, String header, Display display) {

  public ComputedValueDefinition {
    MethodDefinition.requireText(key, "key");
    MethodDefinition.requireText(code, "code");
    MethodDefinition.requireText(label, "label");
    MethodDefinition.requireText(definition, "definition");
    MethodDefinition.requireText(header, "header");
    if (display == null) {
      throw new IllegalArgumentException("display manquant");
    }
  }
}
