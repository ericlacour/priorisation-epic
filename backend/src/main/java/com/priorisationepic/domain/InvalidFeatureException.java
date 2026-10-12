package com.priorisationepic.domain;

/** Champ de fonctionnalité invalide : identifiant, titre, description ou motif de revue. */
public class InvalidFeatureException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  public InvalidFeatureException(String message) {
    super(message);
  }
}
