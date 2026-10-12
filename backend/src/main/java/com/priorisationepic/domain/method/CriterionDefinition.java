package com.priorisationepic.domain.method;

/** Un critère saisi : clé technique, sigle, nom, définition d'aide et en-tête d'import/export. */
public record CriterionDefinition(
    String key, String code, String label, String definition, String header) {

  public CriterionDefinition {
    MethodDefinition.requireText(key, "key");
    MethodDefinition.requireText(code, "code");
    MethodDefinition.requireText(label, "label");
    MethodDefinition.requireText(definition, "definition");
    MethodDefinition.requireText(header, "header");
  }
}
