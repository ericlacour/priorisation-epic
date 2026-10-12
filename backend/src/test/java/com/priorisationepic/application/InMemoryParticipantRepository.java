package com.priorisationepic.application;

import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.ParticipantIdentity;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.Tokens;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Dépôt de participants en mémoire pour les tests de cas d'usage. */
public final class InMemoryParticipantRepository implements ParticipantRepository {

  public final Map<UUID, Participant> participants = new LinkedHashMap<>();
  public final Map<UUID, Instant> lastSeen = new HashMap<>();
  public int lastSeenWrites;

  @Override
  public Optional<ParticipantIdentity> findByToken(SessionId sessionId, String token) {
    return participants.values().stream()
        .filter(p -> p.sessionId().equals(sessionId))
        .filter(p -> Tokens.matches(token, p.participantTokenHash()))
        .findFirst()
        .map(p -> new ParticipantIdentity(p.id(), p.pseudo(), p.role()));
  }

  @Override
  public void updateLastSeen(UUID participantId, Instant at) {
    lastSeen.put(participantId, at);
    lastSeenWrites++;
  }

  @Override
  public void insert(Participant participant) {
    participants.put(participant.id(), participant);
  }

  @Override
  public Optional<Participant> findByPseudo(SessionId sessionId, Pseudo pseudo) {
    return participants.values().stream()
        .filter(p -> p.sessionId().equals(sessionId))
        .filter(p -> p.pseudo().uniquenessKey().equals(pseudo.uniquenessKey()))
        .findFirst();
  }

  @Override
  public Optional<Participant> find(UUID participantId) {
    return Optional.ofNullable(participants.get(participantId));
  }

  @Override
  public List<Participant> findAll(SessionId sessionId) {
    return new ArrayList<>(
        participants.values().stream().filter(p -> p.sessionId().equals(sessionId)).toList());
  }

  @Override
  public void updateToken(Participant participant) {
    participants.put(participant.id(), participant);
  }
}
