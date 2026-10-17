package com.priorisationepic.application;

/**
 * Une autre session porte déjà ce nom, sans tenir compte de la casse ni des espaces autour
 * (FR-001a) : 409 à la création, {@code SESSION_NAME_TAKEN} au renommage.
 */
public final class SessionNameTakenException extends RuntimeException {

  public SessionNameTakenException() {
    super("Nom de session déjà pris");
  }
}
