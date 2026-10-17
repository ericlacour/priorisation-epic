package com.priorisationepic.application;

import java.util.List;

/** Liste de toutes les sessions, ouverte à tous, de la plus récente à la plus ancienne (FR-026). */
public class ListSessionsUseCase {

  private final SessionRepository sessions;

  public ListSessionsUseCase(SessionRepository sessions) {
    this.sessions = sessions;
  }

  public List<SessionSummary> list() {
    return sessions.listSummaries();
  }
}
