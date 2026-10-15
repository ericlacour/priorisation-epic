package com.priorisationepic.application;

import com.priorisationepic.domain.SessionId;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** Un aperçu d'import gardé jusqu'à sa confirmation, ou jusqu'à {@code expiresAt}. */
public record StoredImportPreview(
    UUID id, SessionId sessionId, ImportPreview preview, Instant expiresAt) {

  public StoredImportPreview {
    Objects.requireNonNull(id, "id");
    Objects.requireNonNull(sessionId, "sessionId");
    Objects.requireNonNull(preview, "preview");
    Objects.requireNonNull(expiresAt, "expiresAt");
  }
}
