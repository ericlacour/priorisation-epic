package com.priorisationepic.adapter.in.ws;

import com.priorisationepic.application.ErrorCode;

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
  record ErrorMessage(String type, String code) {

    static ErrorMessage of(ErrorCode code) {
      return new ErrorMessage("error", code.name());
    }
  }
}
