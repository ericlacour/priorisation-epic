package com.priorisationepic.adapter.out.persistence;

import com.priorisationepic.application.Transactions;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/** Réalise {@link Transactions} avec le gestionnaire de transactions de Spring. */
@Component
class SpringTransactions implements Transactions {

  private final TransactionTemplate template;

  SpringTransactions(TransactionTemplate template) {
    this.template = template;
  }

  @Override
  public <T> T inTransaction(Supplier<T> action) {
    return template.execute(status -> action.get());
  }
}
