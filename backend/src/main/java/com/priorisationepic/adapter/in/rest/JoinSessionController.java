package com.priorisationepic.adapter.in.rest;

import com.priorisationepic.adapter.in.rest.InvalidRequestException.FieldError;
import com.priorisationepic.adapter.in.rest.SessionDtos.JoinSessionRequest;
import com.priorisationepic.adapter.in.rest.SessionDtos.JoinSessionResponse;
import com.priorisationepic.application.JoinSessionUseCase;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Arrivée d'un participant : {@code POST /api/sessions/{sessionId}/participants} (joinSession). */
@RestController
public class JoinSessionController {

  private final JoinSessionUseCase join;

  public JoinSessionController(JoinSessionUseCase join) {
    this.join = join;
  }

  @PostMapping("/api/sessions/{sessionId}/participants")
  ResponseEntity<JoinSessionResponse> joinSession(
      @PathVariable String sessionId, @RequestBody JoinSessionRequest request) {
    if (request.pseudo() == null || request.pseudo().isBlank()) {
      throw new InvalidRequestException(
          "error.invalid-pseudo", new FieldError("pseudo", "error.pseudo-required"));
    }
    if (request.businessRole() != null
        && request.businessRole().codePointCount(0, request.businessRole().length()) > 40) {
      throw new InvalidRequestException(
          "error.invalid-request", new FieldError("businessRole", "error.business-role-invalid"));
    }
    JoinSessionUseCase.Joined joined =
        join.join(sessionId, request.pseudo(), request.businessRole());
    return ResponseEntity.status(HttpStatus.CREATED)
        .body(new JoinSessionResponse(joined.participantToken()));
  }
}
