package com.priorisationepic.domain.method;

import java.util.Map;

/**
 * Une méthode de priorisation : une classe, une version. Elle définit ses critères et ses valeurs
 * calculées, calcule en fractions exactes, explique le calcul avec les vraies valeurs (constitution
 * I) et ordonne deux fonctionnalités calculables. Toute évolution d'un critère, d'un calcul ou d'un
 * tri crée une nouvelle version, jamais une modification.
 */
public interface PrioritizationMethod {

  MethodDefinition definition();

  /**
   * Les valeurs calculées par clé de {@link MethodDefinition#computedValues()}. Appelée seulement
   * quand tous les critères sont renseignés et dans l'échelle.
   */
  Map<String, Fraction> compute(Criteria criteria);

  /** Le détail du calcul avec les vraies valeurs, par exemple « CoD = 8 + 5 + 3 = 16 ; … ». */
  String explain(Criteria criteria);

  /**
   * Ordre entre deux fonctionnalités calculables : négatif si {@code a} passe avant {@code b}. Les
   * égalités sont départagées ensuite par l'identifiant, par {@link Ranking}.
   */
  int compare(Map<String, Fraction> a, Map<String, Fraction> b);
}
