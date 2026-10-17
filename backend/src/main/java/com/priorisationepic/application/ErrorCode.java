package com.priorisationepic.application;

/** Codes de {@code error.code} du canal WebSocket (contract/schemas/error.json). */
public enum ErrorCode {
  INVALID_MESSAGE,
  FORBIDDEN,
  SESSION_CLOSED,
  STALE_VERSION,
  INVALID_VALUE,
  DUPLICATE_EXTERNAL_ID,
  FEATURE_IN_OPEN_ROUND,
  ROUND_REVEALED,
  SCALE_IMPACT,
  UNKNOWN_PARTICIPANT,
  SESSION_NOT_STARTED,
  ROUND_OPEN,
  PARTICIPANT_OFFLINE,
  UNKNOWN_CRITERION,
  SESSION_NAME_TAKEN
}
