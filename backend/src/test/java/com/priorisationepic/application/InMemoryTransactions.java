package com.priorisationepic.application;

import java.util.function.Supplier;

/** Transactions de test : exécute l'action telle quelle et compte les transactions ouvertes. */
public final class InMemoryTransactions implements Transactions {

  public int count;

  @Override
  public <T> T inTransaction(Supplier<T> action) {
    count++;
    return action.get();
  }
}
