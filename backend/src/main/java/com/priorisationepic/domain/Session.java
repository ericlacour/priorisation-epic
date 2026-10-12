package com.priorisationepic.domain;

import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.method.PrioritizationMethod;
import com.priorisationepic.domain.scale.Scale;
import java.time.Instant;
import java.util.Objects;

/**
 * Session de priorisation. Immuable. La méthode et sa version sont figées à la création (FR-017).
 * Les règles qui dépendent des tours de vote (tour ouvert, etc.) relèvent de l'application.
 */
public record Session(
    SessionId sessionId,
    String animationTokenHash,
    String name,
    SessionStatus status,
    String method,
    int methodVersion,
    Scale scale,
    Instant createdAt,
    Pseudo createdByPseudo,
    long version) {

  public static final int MAX_NAME = 120;

  public Session {
    Objects.requireNonNull(sessionId, "sessionId");
    Objects.requireNonNull(animationTokenHash, "animationTokenHash");
    Objects.requireNonNull(status, "status");
    Objects.requireNonNull(method, "method");
    Objects.requireNonNull(scale, "scale");
    Objects.requireNonNull(createdAt, "createdAt");
    Objects.requireNonNull(createdByPseudo, "createdByPseudo");
    name = name == null ? "" : name.strip();
    if (name.isEmpty() || name.length() > MAX_NAME) {
      throw new InvalidSessionException("Le nom doit comporter de 1 à 120 caractères");
    }
  }

  /**
   * Nouvelle session en {@code PREPARATION}, échelle par défaut. {@code methodKey} nul : méthode
   * par défaut du registre. La version est la dernière connue de la méthode. {@link
   * com.priorisationepic.domain.method.UnknownMethodException} si la méthode est inconnue.
   */
  public static Session create(
      MethodRegistry registry,
      SessionId sessionId,
      String name,
      String methodKey,
      String animationTokenHash,
      Pseudo createdBy,
      Instant now) {
    PrioritizationMethod chosen =
        methodKey == null ? registry.defaultMethod() : registry.latest(methodKey);
    return new Session(
        sessionId,
        animationTokenHash,
        name,
        SessionStatus.PREPARATION,
        chosen.definition().key(),
        chosen.definition().version(),
        Scale.defaultScale(),
        now,
        createdBy,
        0);
  }

  /** La méthode de cette session, dans la version figée à sa création. */
  public PrioritizationMethod prioritizationMethod(MethodRegistry registry) {
    return registry.get(method, methodVersion);
  }

  public boolean isClosed() {
    return status == SessionStatus.CLOSED;
  }

  /** Un tour de vote ne s'ouvre qu'en cours de session (FR-004, FR-018). */
  public boolean canOpenRound() {
    return status == SessionStatus.IN_PROGRESS;
  }

  /** PREPARATION vers IN_PROGRESS. */
  public Session start() {
    return transition(SessionStatus.PREPARATION, SessionStatus.IN_PROGRESS);
  }

  /** IN_PROGRESS vers CLOSED. */
  public Session close() {
    return transition(SessionStatus.IN_PROGRESS, SessionStatus.CLOSED);
  }

  /** CLOSED vers IN_PROGRESS. */
  public Session reopen() {
    return transition(SessionStatus.CLOSED, SessionStatus.IN_PROGRESS);
  }

  public Session rename(String newName) {
    return copy(newName, status, scale, animationTokenHash, version);
  }

  public Session withScale(Scale newScale) {
    return copy(name, status, newScale, animationTokenHash, version);
  }

  public Session withAnimationTokenHash(String newHash) {
    return copy(name, status, scale, newHash, version);
  }

  public Session withVersion(long newVersion) {
    return copy(name, status, scale, animationTokenHash, newVersion);
  }

  private Session transition(SessionStatus from, SessionStatus to) {
    if (status != from) {
      throw new InvalidTransitionException(status, to);
    }
    return copy(name, to, scale, animationTokenHash, version);
  }

  private Session copy(
      String newName, SessionStatus newStatus, Scale newScale, String newHash, long newVersion) {
    return new Session(
        sessionId,
        newHash,
        newName,
        newStatus,
        method,
        methodVersion,
        newScale,
        createdAt,
        createdByPseudo,
        newVersion);
  }

  /** Sans l'empreinte du jeton d'animation. */
  @Override
  public String toString() {
    return "Session[" + sessionId + ", " + status + "]";
  }
}
