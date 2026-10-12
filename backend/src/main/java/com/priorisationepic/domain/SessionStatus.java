package com.priorisationepic.domain;

/** Statut d'une session : préparation, en cours, clôturée (lecture seule). */
public enum SessionStatus {
  PREPARATION,
  IN_PROGRESS,
  CLOSED
}
