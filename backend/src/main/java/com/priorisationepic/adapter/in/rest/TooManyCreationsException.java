package com.priorisationepic.adapter.in.rest;

/** Trop de créations depuis cette adresse : {@code 429} avec {@code Retry-After}. */
class TooManyCreationsException extends RuntimeException {

  private final long retryAfterSeconds;

  TooManyCreationsException(long retryAfterSeconds) {
    super("Too many sessions created from one client.");
    this.retryAfterSeconds = retryAfterSeconds;
  }

  long retryAfterSeconds() {
    return retryAfterSeconds;
  }
}
