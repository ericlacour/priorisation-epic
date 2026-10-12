package com.priorisationepic.adapter.in.ws;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.priorisationepic.application.ErrorCode;
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
  record ErrorMessage(String type, String code, UUID featureId) {

    static ErrorMessage of(ErrorCode code, UUID featureId) {
      return new ErrorMessage("error", code.name(), featureId);
    }
  }
}
