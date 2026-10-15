package com.priorisationepic.application;

import com.priorisationepic.domain.method.MethodDefinition;

/** Le modèle Excel vierge d'une méthode (FR-007a), généré à partir de sa définition. */
public interface ImportTemplate {

  /** Le classeur {@code .xlsx} du modèle. */
  byte[] write(MethodDefinition method);
}
