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

  void insert(Participant participant);

  /** Le participant de ce pseudo, sans tenir compte de la casse. */
  Optional<Participant> findByPseudo(SessionId sessionId, Pseudo pseudo);

  Optional<Participant> find(UUID participantId);

  /** Les participants de la session, du plus ancien au plus récent. */
  List<Participant> findAll(SessionId sessionId);

  /** Reprise d'un pseudo : enregistre la nouvelle empreinte de jeton et la dernière activité. */
  void updateToken(Participant participant);
}
