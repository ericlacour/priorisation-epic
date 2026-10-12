package com.priorisationepic.application;

import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.Role;
import com.priorisationepic.domain.SessionId;
import java.util.List;
import java.util.UUID;

/**
 * Il y a toujours exactement un animateur par session (FR-002a). Ce composant fait passer le rôle à
 * un participant (prise du rôle par le lien d'animation, ou transmission) : l'ancien animateur
 * redevient participant, en base et pour toutes ses connexions ouvertes. À appeler sous le verrou
 * de la session ; la diffusion de l'état reste à l'appelant.
 */
final class FacilitatorRoles {

  private final ParticipantRepository participants;
  private final SessionRepository sessions;
  private final Transactions transactions;
  private final Broadcaster broadcaster;

  FacilitatorRoles(
      ParticipantRepository participants,
      SessionRepository sessions,
      Transactions transactions,
      Broadcaster broadcaster) {
    this.participants = participants;
    this.sessions = sessions;
    this.transactions = transactions;
    this.broadcaster = broadcaster;
  }

  /**
   * Fait de {@code newFacilitator} l'animateur. Les écritures partagent la transaction de
   * l'appelant s'il en a une ouverte.
   *
   * @return vrai si les rôles ont changé, faux s'il l'était déjà
   */
  boolean transferTo(SessionId sessionId, UUID newFacilitator) {
    List<Participant> all = participants.findAll(sessionId);
    List<UUID> demoted =
        all.stream()
            .filter(p -> p.role() == Role.FACILITATOR && !p.id().equals(newFacilitator))
            .map(Participant::id)
            .toList();
    boolean alreadyFacilitator =
        all.stream().anyMatch(p -> p.id().equals(newFacilitator) && p.role() == Role.FACILITATOR);
    if (alreadyFacilitator && demoted.isEmpty()) {
      return false;
    }
    transactions.inTransaction(
        () -> {
          demoted.forEach(id -> participants.updateRole(id, Role.PARTICIPANT));
          participants.updateRole(newFacilitator, Role.FACILITATOR);
          sessions.bumpVersion(sessionId);
          return null;
        });
    demoted.forEach(id -> broadcaster.setFacilitator(sessionId, id, false));
    broadcaster.setFacilitator(sessionId, newFacilitator, true);
    return true;
  }
}
