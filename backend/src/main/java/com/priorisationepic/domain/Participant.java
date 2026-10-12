package com.priorisationepic.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * Participant d'une session. Immuable. Le rôle d'animateur ne s'obtient jamais par le pseudo. Le
 * pseudo est unique par session sans tenir compte de la casse ({@link Pseudo#uniquenessKey()}).
 */
public record Participant(
    UUID id,
    SessionId sessionId,
    Pseudo pseudo,
    Role role,
    String businessRole,
    String participantTokenHash,
    Instant joinedAt,
    Instant lastSeenAt,
    long version) {

  public Participant {
    Objects.requireNonNull(id, "id");
    Objects.requireNonNull(sessionId, "sessionId");
    Objects.requireNonNull(pseudo, "pseudo");
    Objects.requireNonNull(role, "role");
    Objects.requireNonNull(participantTokenHash, "participantTokenHash");
    Objects.requireNonNull(joinedAt, "joinedAt");
    Objects.requireNonNull(lastSeenAt, "lastSeenAt");
  }

  /** Nouveau participant, vu à l'instant {@code now}, version 0. */
  public static Participant join(
      UUID id, SessionId sessionId, Pseudo pseudo, Role role, String tokenHash, Instant now) {
    return new Participant(id, sessionId, pseudo, role, null, tokenHash, now, now, 0);
  }

  public boolean isFacilitator() {
    return role == Role.FACILITATOR;
  }

  /** Mise à jour de {@code lastSeenAt}. */
  public Participant seen(Instant at) {
    return new Participant(
        id, sessionId, pseudo, role, businessRole, participantTokenHash, joinedAt, at, version);
  }

  /**
   * Vrai si le pseudo peut être repris : participant non animateur absent depuis au moins {@code
   * absenceTimeout} (compté depuis {@code lastSeenAt}). L'application vérifie en plus qu'aucune
   * connexion n'est ouverte.
   */
  public boolean canBeReclaimed(Instant now, Duration absenceTimeout) {
    return !isFacilitator() && !now.isBefore(lastSeenAt.plus(absenceTimeout));
  }

  /** Reprise du pseudo : même participant (et mêmes votes), nouvelle empreinte de jeton. */
  public Participant reclaim(String newTokenHash, Instant now) {
    return new Participant(
        id, sessionId, pseudo, role, businessRole, newTokenHash, joinedAt, now, version);
  }

  public Participant withRole(Role newRole) {
    return new Participant(
        id,
        sessionId,
        pseudo,
        newRole,
        businessRole,
        participantTokenHash,
        joinedAt,
        lastSeenAt,
        version);
  }

  public Participant withBusinessRole(String newBusinessRole) {
    return new Participant(
        id,
        sessionId,
        pseudo,
        role,
        newBusinessRole,
        participantTokenHash,
        joinedAt,
        lastSeenAt,
        version);
  }

  public Participant withTokenHash(String newTokenHash) {
    return new Participant(
        id, sessionId, pseudo, role, businessRole, newTokenHash, joinedAt, lastSeenAt, version);
  }

  public Participant withVersion(long newVersion) {
    return new Participant(
        id,
        sessionId,
        pseudo,
        role,
        businessRole,
        participantTokenHash,
        joinedAt,
        lastSeenAt,
        newVersion);
  }

  /** Sans l'empreinte du jeton. */
  @Override
  public String toString() {
    return "Participant[id=" + id + ", role=" + role + "]";
  }
}
