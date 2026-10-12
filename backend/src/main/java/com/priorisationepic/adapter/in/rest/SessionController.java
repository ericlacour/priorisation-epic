package com.priorisationepic.adapter.in.rest;

import com.priorisationepic.application.CreateSessionUseCase;
import com.priorisationepic.application.SessionState;
import com.priorisationepic.application.SessionStateAssembler;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.domain.scale.ScaleType;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Création et consultation d'une session (contrat : createSession, getSession). La création est
 * limitée par adresse cliente ({@link CreationRateLimiter}) ; seules les créations réussies
 * comptent.
 */
@RestController
public class SessionController {

  /** {@code create-session-request.json} ; {@code allowedValues} d'une échelle est ignoré. */
  public record CreateSessionRequest(
      String name, String pseudo, String method, ScaleRequest scale) {}

  public record ScaleRequest(String type, Integer max, List<Integer> allowedValues) {}

  /** {@code create-session-response.json} */
  public record CreateSessionResponse(
      String sessionId, String participantToken, String animationToken) {

    /** Jamais les jetons dans un journal. */
    @Override
    public String toString() {
      return "CreateSessionResponse[" + sessionId + "]";
    }
  }

  private final CreateSessionUseCase createSession;
  private final SessionStateAssembler states;
  private final CreationRateLimiter limiter;

  public SessionController(
      CreateSessionUseCase createSession,
      SessionStateAssembler states,
      CreationRateLimiter limiter) {
    this.createSession = createSession;
    this.states = states;
    this.limiter = limiter;
  }

  @PostMapping("/api/sessions")
  @ResponseStatus(HttpStatus.CREATED)
  public CreateSessionResponse create(
      @RequestBody CreateSessionRequest request, HttpServletRequest http) {
    if (request == null || request.name() == null || request.pseudo() == null) {
      throw new MalformedRequestException();
    }
    Scale scale = scaleOf(request.scale());
    CreationRateLimiter.Slot slot = limiter.acquire(ClientAddress.of(http));
    try {
      CreateSessionUseCase.Created created =
          createSession.create(
              new CreateSessionUseCase.Command(
                  request.name(), request.pseudo(), request.method(), scale));
      return new CreateSessionResponse(
          created.sessionId().value(), created.participantToken(), created.animationToken());
    } catch (RuntimeException e) {
      limiter.release(slot);
      throw e;
    }
  }

  @GetMapping("/api/sessions/{sessionId}")
  public SessionState get(@PathVariable String sessionId) {
    return states.consultation(sessionIdOf(sessionId)).orElseThrow(SessionNotFoundException::new);
  }

  /** L'échelle demandée ; seule l'échelle continue existe tant que Fibonacci n'est pas livrée. */
  private static Scale scaleOf(ScaleRequest request) {
    if (request == null) {
      return null;
    }
    if (request.max() == null || !ScaleType.CONTINUOUS.name().equals(request.type())) {
      throw new MalformedRequestException();
    }
    return Scale.continuous(request.max());
  }

  static SessionId sessionIdOf(String raw) {
    if (!SessionId.isValid(raw)) {
      throw new SessionNotFoundException();
    }
    return new SessionId(raw);
  }
}
