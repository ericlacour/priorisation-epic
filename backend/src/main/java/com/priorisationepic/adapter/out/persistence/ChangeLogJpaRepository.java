package com.priorisationepic.adapter.out.persistence;

import com.priorisationepic.application.ChangeLogRepository;
import com.priorisationepic.domain.ChangeLogEntry;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Écrit l'historique avec JPA. La transaction de la modification tracée est obligatoire ({@link
 * Propagation#MANDATORY}) : l'entrée et la modification sont validées ensemble, ou pas du tout.
 */
@Repository
class ChangeLogJpaRepository implements ChangeLogRepository {

  private final ChangeLogSpringRepository entries;

  ChangeLogJpaRepository(ChangeLogSpringRepository entries) {
    this.entries = entries;
  }

  @Override
  @Transactional(propagation = Propagation.MANDATORY)
  public void append(ChangeLogEntry entry) {
    entries.save(
        new ChangeLogEntity(
            entry.id(),
            entry.sessionId().value(),
            entry.at(),
            entry.author().value(),
            entry.entityType().name(),
            entry.entityId(),
            entry.action().name(),
            entry.field(),
            entry.oldValue(),
            entry.newValue()));
  }
}
