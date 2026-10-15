package com.priorisationepic.application;

import com.priorisationepic.domain.scale.Scale;
import java.util.List;
import java.util.UUID;

/**
 * Une intention de l'animateur est refusée : rien n'a changé, la connexion reçoit {@code error}
 * avec ce code (et, pour {@code STALE_VERSION}, la fonctionnalité concernée ; pour {@code
 * SCALE_IMPACT}, les valeurs impactées).
 */
public final class IntentRejectedException extends RuntimeException {

  private final ErrorCode code;
  private final transient UUID featureId;
  private final transient List<Scale.Impact> impactedValues;

  public IntentRejectedException(ErrorCode code) {
    this(code, null);
  }

  public IntentRejectedException(ErrorCode code, UUID featureId) {
    this(code, featureId, List.of());
  }

  private IntentRejectedException(
      ErrorCode code, UUID featureId, List<Scale.Impact> impactedValues) {
    super(code.name());
    this.code = code;
    this.featureId = featureId;
    this.impactedValues = List.copyOf(impactedValues);
  }

  /** {@code SCALE_IMPACT} : le changement d'échelle mettrait ces valeurs hors échelle. */
  public static IntentRejectedException scaleImpact(List<Scale.Impact> impactedValues) {
    return new IntentRejectedException(ErrorCode.SCALE_IMPACT, null, impactedValues);
  }

  public ErrorCode code() {
    return code;
  }

  /** La fonctionnalité concernée, ou {@code null}. */
  public UUID featureId() {
    return featureId;
  }

  /** Les valeurs impactées d'un {@code SCALE_IMPACT}, sinon une liste vide. */
  public List<Scale.Impact> impactedValues() {
    return impactedValues;
  }
}
