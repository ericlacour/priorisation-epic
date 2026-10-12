package com.priorisationepic.application;

import com.priorisationepic.domain.ChangeLogEntry;

/** Historique des modifications (FR-025). Les entrées ne sont jamais modifiées ni supprimées. */
public interface ChangeLogRepository {

  /** Ajoute une entrée, dans la transaction de la modification qu'elle trace. */
  void append(ChangeLogEntry entry);
}
