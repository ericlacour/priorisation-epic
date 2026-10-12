package com.priorisationepic.application;

import com.priorisationepic.domain.ParticipantIdentity;
import com.priorisationepic.domain.SessionId;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** Accès aux participants d'une session. */
public interface ParticipantRepository {

  /** Le participant de la session dont l'empreinte de jeton est celle de {@code token}. */
  Optional<ParticipantIdentity> findByToken(SessionId sessionId, String token);

  /** Enregistre la dernière activité du participant ({@code last_seen_at}). */
  void updateLastSeen(UUID participantId, Instant at);
}
