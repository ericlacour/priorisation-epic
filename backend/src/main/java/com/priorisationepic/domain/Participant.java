package com.priorisationepic.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * Participant d'une session. Seule l'empreinte de son jeton est gardée ({@code tokenHash}). Le rôle
 * d'animateur n'est jamais accordé par le pseudo : il vient du jeton d'animation.
 */
public record Participant(
    UUID id,
    SessionId sessionId,
    Pseudo pseudo,
    Role role,
    String businessRole,
    String tokenHash,
    Instant joinedAt,
    Instant lastSeenAt) {

  public static final int BUSINESS_ROLE_MAX_LENGTH = 40;

  public Participant {
    Objects.requireNonNull(id, "id");
    Objects.requireNonNull(sessionId, "sessionId");
    Objects.requireNonNull(pseudo, "pseudo");
    Objects.requireNonNull(role, "role");
    Objects.requireNonNull(tokenHash, "tokenHash");
    Objects.requireNonNull(joinedAt, "joinedAt");
    Objects.requireNonNull(lastSeenAt, "lastSeenAt");
    if (businessRole != null
        && businessRole.codePointCount(0, businessRole.length()) > BUSINESS_ROLE_MAX_LENGTH) {
      throw new IllegalArgumentException("Le rôle métier compte 40 caractères au plus.");
    }
  }

  /** Le participant qui crée la session : il en est l'animateur. */
  public static Participant facilitator(
      UUID id, SessionId sessionId, Pseudo pseudo, String tokenHash, Instant now) {
    return new Participant(id, sessionId, pseudo, Role.FACILITATOR, null, tokenHash, now, now);
  }

  /** Un participant ordinaire. */
  public static Participant joining(
      UUID id,
      SessionId sessionId,
      Pseudo pseudo,
      String businessRole,
      String tokenHash,
      Instant now) {
    return new Participant(
        id, sessionId, pseudo, Role.PARTICIPANT, businessRole, tokenHash, now, now);
  }

  public boolean isFacilitator() {
    return role == Role.FACILITATOR;
  }

  /**
   * Vrai si son pseudo peut être repris : aucune connexion ouverte (à vérifier par l'appelant) et
   * dernière activité d'au moins {@code absenceTimeout}. Jamais pour l'animateur (FR-002).
   */
  public boolean isReclaimable(Instant now, Duration absenceTimeout) {
    return !isFacilitator() && Duration.between(lastSeenAt, now).compareTo(absenceTimeout) >= 0;
  }

  /** Le même participant, rattaché à un nouvel arrivant : nouveau jeton, ancien invalidé. */
  public Participant withTokenHash(String newTokenHash, Instant now) {
    return new Participant(id, sessionId, pseudo, role, businessRole, newTokenHash, joinedAt, now);
  }
}
