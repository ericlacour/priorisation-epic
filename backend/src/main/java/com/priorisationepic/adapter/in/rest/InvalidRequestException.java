package com.priorisationepic.adapter.in.rest;

import java.util.List;

/**
 * Requête lisible mais invalide : 400 {@code problem+json} avec le détail en français et, par
 * champ, ce qu'il faut corriger. Les clés sont celles de {@code messages.properties}.
 */
class InvalidRequestException extends RuntimeException {

  /** Un champ refusé : son nom dans le contrat et la clé de son message. */
  record FieldError(String field, String messageKey) {}

  private final String detailKey;
  private final transient List<FieldError> errors;

  InvalidRequestException(String detailKey, FieldError... errors) {
    super("Invalid request.");
    this.detailKey = detailKey;
    this.errors = List.of(errors);
  }

  String detailKey() {
    return detailKey;
  }

  List<FieldError> errors() {
    return errors;
  }
}
