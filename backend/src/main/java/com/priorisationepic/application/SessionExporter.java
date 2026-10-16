package com.priorisationepic.application;

import java.time.Instant;

/** Écriture d'un export à partir de la vue de la session (contracts/file-formats.md). */
public interface SessionExporter {

  /**
   * Le fichier de {@code state} au format demandé. Les fonctionnalités sont dans l'ordre du tableau
   * ; {@code exportedAt} date l'export (légende Confluence, champ {@code exportedAt}).
   */
  ExportFile write(ExportFormat format, SessionStateView state, Instant exportedAt);
}
