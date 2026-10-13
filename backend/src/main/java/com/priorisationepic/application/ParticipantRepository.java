package com.priorisationepic.application;

import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.ParticipantIdentity;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.SessionId;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Accès aux participants d'une session. */
public interface ParticipantRepository {

  /** Le participant de la session dont l'empreinte de jeton est celle de {@code token}. */
  Optional<ParticipantIdentity> findByToken(SessionId sessionId, String token);

  /** Enregistre la dernière activité du participant ({@code last_seen_at}). */
  void updateLastSeen(UUID participantId, Instant at);

  /**
   * Ajoute un participant.
   *
   * @throws PseudoTakenException si le pseudo est déjà pris dans la session (sans tenir compte de
   *     la casse)
   */
  void insert(Participant participant);

  /** Le participant de la session qui porte ce pseudo, sans tenir compte de la casse. */
  Optional<Participant> findByPseudo(SessionId sessionId, Pseudo pseudo);

  Optional<Participant> findById(UUID participantId);

  /** Les participants de la session, dans l'ordre d'arrivée. */
  List<Participant> list(SessionId sessionId);

  /** Remplace l'empreinte du jeton d'un participant repris et note son retour. */
  void replaceToken(UUID participantId, String tokenHash, Instant at);
}
