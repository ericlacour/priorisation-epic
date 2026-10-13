package com.priorisationepic.application;

import java.util.function.Supplier;

/**
 * Exécute une séquence d'écritures dans une seule transaction : la modification et son historique
 * sont validés ensemble, ou pas du tout (constitution III).
 */
public interface Transactions {

  <T> T run(Supplier<T> action);

  default void run(Runnable action) {
    run(
        () -> {
          action.run();
          return null;
        });
  }
}
