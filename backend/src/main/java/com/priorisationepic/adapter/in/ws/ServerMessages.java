package com.priorisationepic.adapter.in.ws;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.priorisationepic.application.ErrorCode;
import com.priorisationepic.domain.scale.Scale;
import java.util.List;
import java.util.UUID;

/**
 * Messages serveur → client du canal de session (asyncapi.yaml), d'après {@code tick.json} et
 * {@code error.json}.
 */
final class ServerMessages {

  private ServerMessages() {}

  /** {@code tick.json} */
  record TickMessage(String type) {
    static final TickMessage INSTANCE = new TickMessage("tick");
  }

  /** {@code error.json} */
  @JsonInclude(JsonInclude.Include.NON_NULL)
  record ErrorMessage(
      String type, String code, UUID featureId, List<ImpactedValue> impactedValues) {

    static ErrorMessage of(ErrorCode code) {
      return of(code, null);
    }

    static ErrorMessage of(ErrorCode code, UUID featureId) {
      return new ErrorMessage("error", code.name(), featureId, null);
    }

    /** {@code SCALE_IMPACT} et ses valeurs impactées. */
    static ErrorMessage scaleImpact(List<Scale.Impact> impacts) {
      return new ErrorMessage(
          "error",
          ErrorCode.SCALE_IMPACT.name(),
          null,
          impacts.stream()
              .map(i -> new ImpactedValue(i.externalId(), i.criterionKey(), i.value()))
              .toList());
    }
  }

  /** Une valeur que le changement d'échelle mettrait hors échelle. */
  record ImpactedValue(String externalId, String criterion, int value) {}
}
