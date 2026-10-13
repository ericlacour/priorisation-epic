package com.priorisationepic.application;

import java.util.UUID;

/**
 * Une intention de l'animateur est refusée : rien n'a changé, la connexion reçoit {@code error}
 * avec ce code (et, pour {@code STALE_VERSION}, la fonctionnalité concernée).
 */
public final class IntentRejectedException extends RuntimeException {

  private final ErrorCode code;
  private final transient UUID featureId;

  public IntentRejectedException(ErrorCode code) {
    this(code, null);
  }

  public IntentRejectedException(ErrorCode code, UUID featureId) {
    super(code.name());
    this.code = code;
    this.featureId = featureId;
  }

  public ErrorCode code() {
    return code;
  }

  /** La fonctionnalité concernée, ou {@code null}. */
  public UUID featureId() {
    return featureId;
  }
}
