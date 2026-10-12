package com.priorisationepic.adapter.in.rest;

import com.priorisationepic.application.JoinSessionUseCase;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Arrivée d'un participant avec un pseudo (contrat : joinSession, FR-002, FR-003). */
@RestController
public class JoinSessionController {

  /** {@code join-session-request.json} */
  public record JoinSessionRequest(String pseudo, String businessRole) {}

  /** {@code join-session-response.json} */
  public record JoinSessionResponse(String participantToken) {

    /** Jamais le jeton dans un journal. */
    @Override
    public String toString() {
      return "JoinSessionResponse[***]";
    }
  }

  private final JoinSessionUseCase joinSession;

  public JoinSessionController(JoinSessionUseCase joinSession) {
    this.joinSession = joinSession;
  }

  @PostMapping("/api/sessions/{sessionId}/participants")
  @ResponseStatus(HttpStatus.CREATED)
  public JoinSessionResponse join(
      @PathVariable String sessionId, @RequestBody JoinSessionRequest request) {
    if (request == null || request.pseudo() == null) {
      throw new MalformedRequestException();
    }
    JoinSessionUseCase.Result result =
        joinSession.join(
            SessionController.sessionIdOf(sessionId),
            new JoinSessionUseCase.Command(request.pseudo(), request.businessRole()));
    return switch (result) {
      case JoinSessionUseCase.Result.Joined joined ->
          new JoinSessionResponse(joined.participantToken());
      case JoinSessionUseCase.Result.SessionNotFound notFound ->
          throw new SessionNotFoundException();
      case JoinSessionUseCase.Result.PseudoTaken taken -> throw new PseudoTakenException();
    };
  }
}
