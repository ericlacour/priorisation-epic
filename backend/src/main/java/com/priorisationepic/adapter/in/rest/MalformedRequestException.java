package com.priorisationepic.adapter.in.rest;

/** Corps lisible en JSON mais hors schéma : 400 {@code problem+json}. */
class MalformedRequestException extends RuntimeException {

  MalformedRequestException() {
    super("Malformed request.");
  }
}
