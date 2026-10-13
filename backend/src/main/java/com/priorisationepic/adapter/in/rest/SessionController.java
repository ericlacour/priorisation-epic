package com.priorisationepic.adapter.in.rest;

import com.priorisationepic.adapter.in.rest.InvalidRequestException.FieldError;
import com.priorisationepic.adapter.in.rest.SessionDtos.CreateSessionRequest;
import com.priorisationepic.adapter.in.rest.SessionDtos.CreateSessionResponse;
import com.priorisationepic.adapter.in.rest.SessionDtos.ScaleRequest;
import com.priorisationepic.application.CreateSessionUseCase;
import com.priorisationepic.application.SessionNotFoundException;
import com.priorisationepic.application.SessionStateAssembler;
import com.priorisationepic.application.SessionStateView;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.domain.scale.ScaleType;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Création et consultation d'une session. La création est limitée par adresse cliente (429) ; une
 * création qui échoue ne compte pas.
 */
@RestController
public class SessionController {

  private final CreateSessionUseCase create;
  private final SessionStateAssembler states;
  private final CreationRateLimiter limiter;

  public SessionController(
      CreateSessionUseCase create, SessionStateAssembler states, CreationRateLimiter limiter) {
    this.create = create;
    this.states = states;
    this.limiter = limiter;
  }

  /** {@code POST /api/sessions} (createSession) */
  @PostMapping("/api/sessions")
  ResponseEntity<CreateSessionResponse> createSession(
      @RequestBody CreateSessionRequest request, HttpServletRequest http) {
    CreateSessionUseCase.Command command = command(request);
    CreationRateLimiter.Slot slot = limiter.acquire(ClientAddress.of(http));
    try {
      CreateSessionUseCase.Created created = create.create(command);
      return ResponseEntity.status(HttpStatus.CREATED)
          .body(
              new CreateSessionResponse(
                  created.sessionId().value(),
                  created.participantToken(),
                  created.animationToken()));
    } catch (RuntimeException e) {
      limiter.release(slot);
      throw e;
    }
  }

  /**
   * {@code GET /api/sessions/{sessionId}} (getSession) : la vue d'un participant ordinaire, sans
   * jeton.
   */
  @GetMapping("/api/sessions/{sessionId}")
  SessionStateView getSession(@PathVariable String sessionId) {
    if (!SessionId.isValid(sessionId)) {
      throw new SessionNotFoundException();
    }
    return states.readOnlyView(new SessionId(sessionId)).orElseThrow(SessionNotFoundException::new);
  }

  private static CreateSessionUseCase.Command command(CreateSessionRequest request) {
    if (request.pseudo() == null || request.pseudo().isBlank()) {
      throw new InvalidRequestException(
          "error.invalid-pseudo", new FieldError("pseudo", "error.pseudo-required"));
    }
    try {
      Pseudo.of(request.pseudo());
    } catch (com.priorisationepic.domain.InvalidPseudoException e) {
      throw new InvalidRequestException(
          "error.invalid-pseudo", new FieldError("pseudo", "error.invalid-pseudo"));
    }
    if (request.name() == null
        || request.name().isBlank()
        || request.name().codePointCount(0, request.name().length()) > 120) {
      throw new InvalidRequestException(
          "error.invalid-request", new FieldError("name", "error.name-invalid"));
    }
    return new CreateSessionUseCase.Command(
        request.name(), request.pseudo(), request.method(), scale(request.scale()));
  }

  private static Scale scale(ScaleRequest request) {
    if (request == null) {
      return null;
    }
    try {
      if (request.type() == null || request.max() == null) {
        throw new IllegalArgumentException("scale");
      }
      return new Scale(ScaleType.valueOf(request.type()), request.max());
    } catch (IllegalArgumentException e) {
      throw new InvalidRequestException(
          "error.invalid-request", new FieldError("scale", "error.invalid-scale"));
    }
  }
}
