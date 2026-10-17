package com.priorisationepic.adapter.in.rest;

import com.priorisationepic.application.ListSessionsUseCase;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Liste des sessions, ouverte à tous et sans jeton (FR-026). */
@RestController
public class SessionListController {

  private final ListSessionsUseCase sessions;

  public SessionListController(ListSessionsUseCase sessions) {
    this.sessions = sessions;
  }

  /** {@code session-summary.json}, une ligne de la liste. */
  record SessionSummaryDto(
      String sessionId,
      String name,
      String facilitatorPseudo,
      String createdAt,
      String status,
      String method,
      int methodVersion) {}

  /** {@code GET /api/sessions} (listSessions) : de la plus récente à la plus ancienne. */
  @GetMapping("/api/sessions")
  List<SessionSummaryDto> listSessions() {
    return sessions.list().stream()
        .map(
            s ->
                new SessionSummaryDto(
                    s.sessionId().value(),
                    s.name(),
                    s.facilitatorPseudo(),
                    s.createdAt().toString(),
                    s.status().name(),
                    s.method(),
                    s.methodVersion()))
        .toList();
  }
}
