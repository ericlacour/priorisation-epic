package com.priorisationepic.domain;

import com.priorisationepic.domain.method.PrioritizationMethod;
import com.priorisationepic.domain.scale.Scale;
import java.time.Instant;
import java.util.Objects;

/**
 * Session de priorisation. La méthode et sa version sont choisies à la création puis figées
 * (FR-017) : une session garde toujours la version qu'elle a reçue. {@code version} est le compteur
 * de changements, envoyé aux clients dans {@code sessionState.version}.
 */
public record Session(
    SessionId id,
    String name,
    SessionStatus status,
    String method,
    int methodVersion,
    Scale scale,
    Instant createdAt,
    Pseudo createdBy,
    int version) {

  public static final int NAME_MAX_LENGTH = 120;

  public Session {
    Objects.requireNonNull(id, "id");
    Objects.requireNonNull(status, "status");
    Objects.requireNonNull(method, "method");
    Objects.requireNonNull(scale, "scale");
    Objects.requireNonNull(createdAt, "createdAt");
    Objects.requireNonNull(createdBy, "createdBy");
    requireName(name);
  }

  /** Nouvelle session en {@code PREPARATION}, avec la méthode donnée dans sa version actuelle. */
  public static Session create(
      SessionId id,
      String name,
      PrioritizationMethod method,
      Scale scale,
      Pseudo creator,
      Instant now) {
    return new Session(
        id,
        name,
        SessionStatus.PREPARATION,
        method.definition().key(),
        method.definition().version(),
        scale,
        now,
        creator,
        0);
  }

  /** La même session, renommée et sur l'échelle donnée. */
  public Session withSettings(String newName, Scale newScale) {
    return new Session(
        id, newName, status, method, methodVersion, newScale, createdAt, createdBy, version);
  }

  /** Les écritures sont refusées en {@code CLOSED}, sauf « rouvrir » (FR-026). */
  public boolean isWritable() {
    return status.allowsWrites();
  }

  private static void requireName(String name) {
    if (name == null || name.isBlank() || name.codePointCount(0, name.length()) > NAME_MAX_LENGTH) {
      throw new IllegalArgumentException("Le nom d'une session compte de 1 à 120 caractères.");
    }
  }
}
