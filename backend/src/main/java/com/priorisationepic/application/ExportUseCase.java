package com.priorisationepic.application;

import com.priorisationepic.domain.SessionId;

/**
 * Export du tableau ou de la session complète (FR-023, FR-024), ouvert à tout membre et sans jeton
 * : l'export part de la même vue que la consultation ({@link SessionStateAssembler#readOnlyView}),
 * donc dans l'ordre du tableau et avec le même masquage. Le masquage d'un tour ouvert s'ajoute avec
 * le vote masqué.
 */
public class ExportUseCase {

  private final SessionStateAssembler states;
  private final SessionExporter exporter;
  private final ClockPort clock;

  public ExportUseCase(SessionStateAssembler states, SessionExporter exporter, ClockPort clock) {
    this.states = states;
    this.exporter = exporter;
    this.clock = clock;
  }

  /**
   * Le fichier de la session au format demandé.
   *
   * @throws SessionNotFoundException session inconnue
   */
  public ExportFile export(String sessionId, ExportFormat format) {
    if (!SessionId.isValid(sessionId)) {
      throw new SessionNotFoundException();
    }
    SessionStateView state =
        states.readOnlyView(new SessionId(sessionId)).orElseThrow(SessionNotFoundException::new);
    return exporter.write(format, state, clock.now());
  }
}
