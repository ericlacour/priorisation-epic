package com.priorisationepic.application;

import com.priorisationepic.domain.SessionId;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** Les aperçus d'import, temporaires. */
public interface ImportPreviewRepository {

  void insert(StoredImportPreview preview);

  /** L'aperçu de la session, s'il existe et n'a pas expiré à {@code now}. */
  Optional<StoredImportPreview> find(SessionId sessionId, UUID previewId, Instant now);

  void delete(UUID previewId);

  /**
   * Supprime les aperçus expirés à {@code now}.
   *
   * @return le nombre d'aperçus supprimés
   */
  int deleteExpired(Instant now);
}
