package com.priorisationepic.application;

import java.util.function.Supplier;

/**
 * Exécute une séquence d'écritures dans une seule transaction : tout est enregistré, ou rien. Port
 * de {@code application}, réalisé par l'adaptateur de persistance, pour que les cas d'usage ne
 * dépendent d'aucun cadre (ArchUnit).
 */
public interface Transactions {

  <T> T inTransaction(Supplier<T> action);
}
