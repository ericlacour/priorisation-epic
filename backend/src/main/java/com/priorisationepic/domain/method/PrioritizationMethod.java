package com.priorisationepic.domain.method;

import java.util.Map;
import java.util.Optional;

/**
 * Une méthode de priorisation, identifiée par (clé, version). Le domaine, l'application et les
 * adaptateurs ne connaissent que cette interface : les critères et les valeurs calculées viennent
 * de {@link #definition()}.
 */
public interface PrioritizationMethod {

  MethodDefinition definition();

  /**
   * Valeurs calculées par clé, dans l'ordre de la définition, en fractions exactes ; vide si la
   * fonctionnalité n'est pas calculable (critère manquant).
   */
  Optional<Map<String, Fraction>> compute(Criteria criteria);

  /**
   * Détail du calcul avec les vraies valeurs.
   *
   * @throws IllegalArgumentException si les critères ne sont pas calculables
   */
  String explain(Criteria criteria);

  /**
   * Ordre entre deux fonctionnalités calculables (valeurs de {@link #compute}) : négatif si {@code
   * a} passe devant {@code b}. {@link Ranking} ajoute ensuite l'identifiant.
   */
  int compare(Map<String, Fraction> a, Map<String, Fraction> b);
}
