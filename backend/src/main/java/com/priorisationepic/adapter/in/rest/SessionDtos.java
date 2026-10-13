package com.priorisationepic.adapter.in.rest;

/** Charges utiles REST de la création et de l'arrivée (contract/schemas). */
final class SessionDtos {

  private SessionDtos() {}

  /** {@code create-session-request.json} */
  record CreateSessionRequest(String name, String pseudo, String method, ScaleRequest scale) {}

  /** {@code scale.json}, en entrée : le type et le maximum. */
  record ScaleRequest(String type, Integer max) {}

  /** {@code create-session-response.json} */
  record CreateSessionResponse(String sessionId, String participantToken, String animationToken) {

    @Override
    public String toString() {
      return "CreateSessionResponse[***]";
    }
  }

  /** {@code join-session-request.json} */
  record JoinSessionRequest(String pseudo, String businessRole) {}

  /** {@code join-session-response.json} */
  record JoinSessionResponse(String participantToken) {

    @Override
    public String toString() {
      return "JoinSessionResponse[***]";
    }
  }
}
