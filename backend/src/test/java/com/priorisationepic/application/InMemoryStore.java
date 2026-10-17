package com.priorisationepic.application;

import com.priorisationepic.domain.ChangeLogEntry;
import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.ParticipantIdentity;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.Tokens;
import com.priorisationepic.domain.method.MethodDefinition;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Dépôts en mémoire pour les tests de cas d'usage. Une transaction est un simple appel : une
 * exception levée dedans annule les écritures déjà faites ({@link #rollbackOnFailure}).
 */
public final class InMemoryStore
    implements SessionRepository,
        ParticipantRepository,
        FeatureRepository,
        ChangeLogRepository,
        Transactions {

  public final Map<SessionId, Session> sessions = new LinkedHashMap<>();
  public final Map<SessionId, String> animationHashes = new LinkedHashMap<>();
  public final Map<UUID, Participant> participants = new LinkedHashMap<>();
  public final Map<UUID, Feature> features = new LinkedHashMap<>();
  public final List<ChangeLogEntry> changeLog = new ArrayList<>();

  /** Nombre de transactions ouvertes, pour vérifier que l'historique est écrit dedans. */
  public int openTransactions;

  /** Faux : une panne dans une transaction ne défait pas les écritures (à ne pas utiliser). */
  public boolean rollbackOnFailure = true;

  private int changeLogWritesInTransaction;

  // --- Transactions ---------------------------------------------------------------------------

  @Override
  public <T> T run(Supplier<T> action) {
    Map<SessionId, Session> sessionsBefore = new LinkedHashMap<>(sessions);
    Map<UUID, Participant> participantsBefore = new LinkedHashMap<>(participants);
    Map<UUID, Feature> featuresBefore = new LinkedHashMap<>(features);
    int logBefore = changeLog.size();
    openTransactions++;
    try {
      return action.get();
    } catch (RuntimeException e) {
      if (rollbackOnFailure) {
        sessions.clear();
        sessions.putAll(sessionsBefore);
        participants.clear();
        participants.putAll(participantsBefore);
        features.clear();
        features.putAll(featuresBefore);
        while (changeLog.size() > logBefore) {
          changeLog.remove(changeLog.size() - 1);
        }
      }
      throw e;
    } finally {
      openTransactions--;
    }
  }

  // --- SessionRepository ----------------------------------------------------------------------

  @Override
  public boolean exists(SessionId sessionId) {
    return sessions.containsKey(sessionId);
  }

  @Override
  public boolean animationTokenMatches(SessionId sessionId, String animationToken) {
    return Tokens.matches(animationToken, animationHashes.get(sessionId));
  }

  @Override
  public void insert(Session session, String animationTokenHash) {
    // Comme l'index unique sur name_key.
    if (findIdByNameKey(Session.nameKey(session.name())).isPresent()) {
      throw new SessionNameTakenException();
    }
    sessions.put(session.id(), session);
    animationHashes.put(session.id(), animationTokenHash);
  }

  @Override
  public Optional<SessionId> findIdByNameKey(String nameKey) {
    return sessions.values().stream()
        .filter(s -> Session.nameKey(s.name()).equals(nameKey))
        .map(Session::id)
        .findFirst();
  }

  @Override
  public Optional<Session> find(SessionId sessionId) {
    return Optional.ofNullable(sessions.get(sessionId));
  }

  @Override
  public void incrementVersion(SessionId sessionId) {
    Session s = sessions.get(sessionId);
    sessions.put(
        sessionId,
        new Session(
            s.id(),
            s.name(),
            s.status(),
            s.method(),
            s.methodVersion(),
            s.scale(),
            s.createdAt(),
            s.createdBy(),
            s.version() + 1));
  }

  @Override
  public void updateSettings(
      SessionId sessionId, String name, com.priorisationepic.domain.scale.Scale scale) {
    findIdByNameKey(Session.nameKey(name))
        .filter(other -> !other.equals(sessionId))
        .ifPresent(
            other -> {
              throw new SessionNameTakenException();
            });
    sessions.put(sessionId, sessions.get(sessionId).withSettings(name, scale));
  }

  @Override
  public void updateStatus(SessionId sessionId, com.priorisationepic.domain.SessionStatus status) {
    Session s = sessions.get(sessionId);
    sessions.put(
        sessionId,
        new Session(
            s.id(),
            s.name(),
            status,
            s.method(),
            s.methodVersion(),
            s.scale(),
            s.createdAt(),
            s.createdBy(),
            s.version()));
  }

  @Override
  public List<SessionSummary> listSummaries() {
    return sessions.values().stream()
        .sorted(
            java.util.Comparator.comparing(Session::createdAt)
                .reversed()
                .thenComparing(s -> s.id().value()))
        .map(
            s ->
                new SessionSummary(
                    s.id(),
                    s.name(),
                    list(s.id()).stream()
                        .filter(p -> p.role() == com.priorisationepic.domain.Role.FACILITATOR)
                        .map(p -> p.pseudo().value())
                        .findFirst()
                        .orElse(s.createdBy().value()),
                    s.createdAt(),
                    s.status(),
                    s.method(),
                    s.methodVersion()))
        .toList();
  }

  /** Remplace la session telle quelle (préparation d'un test). */
  public void put(Session session) {
    sessions.put(session.id(), session);
  }

  // --- ParticipantRepository ------------------------------------------------------------------

  @Override
  public Optional<ParticipantIdentity> findByToken(SessionId sessionId, String token) {
    String hash = Tokens.hash(token);
    return participants.values().stream()
        .filter(p -> p.sessionId().equals(sessionId) && p.tokenHash().equals(hash))
        .findFirst()
        .map(p -> new ParticipantIdentity(p.id(), p.pseudo(), p.role()));
  }

  @Override
  public void updateLastSeen(UUID participantId, Instant at) {
    Participant p = participants.get(participantId);
    participants.put(
        participantId,
        new Participant(
            p.id(),
            p.sessionId(),
            p.pseudo(),
            p.role(),
            p.businessRole(),
            p.tokenHash(),
            p.joinedAt(),
            at));
  }

  @Override
  public void insert(Participant participant) {
    if (findByPseudo(participant.sessionId(), participant.pseudo()).isPresent()) {
      throw new PseudoTakenException();
    }
    participants.put(participant.id(), participant);
  }

  @Override
  public Optional<Participant> findByPseudo(SessionId sessionId, Pseudo pseudo) {
    return participants.values().stream()
        .filter(
            p ->
                p.sessionId().equals(sessionId)
                    && p.pseudo().uniquenessKey().equals(pseudo.uniquenessKey()))
        .findFirst();
  }

  @Override
  public Optional<Participant> findById(UUID participantId) {
    return Optional.ofNullable(participants.get(participantId));
  }

  @Override
  public List<Participant> list(SessionId sessionId) {
    return participants.values().stream().filter(p -> p.sessionId().equals(sessionId)).toList();
  }

  @Override
  public void replaceToken(UUID participantId, String tokenHash, Instant at) {
    participants.put(participantId, participants.get(participantId).withTokenHash(tokenHash, at));
  }

  // --- FeatureRepository ----------------------------------------------------------------------

  @Override
  public int countActive(SessionId sessionId) {
    return (int)
        features.values().stream()
            .filter(f -> f.sessionId().equals(sessionId) && !f.isDeleted())
            .count();
  }

  @Override
  public void insert(Feature feature) {
    features.put(feature.id(), feature);
  }

  @Override
  public Optional<Feature> find(SessionId sessionId, UUID featureId, MethodDefinition method) {
    return Optional.ofNullable(features.get(featureId))
        .filter(f -> f.sessionId().equals(sessionId) && !f.isDeleted());
  }

  @Override
  public List<Feature> listActive(SessionId sessionId, MethodDefinition method) {
    return features.values().stream()
        .filter(f -> f.sessionId().equals(sessionId) && !f.isDeleted())
        .toList();
  }

  @Override
  public boolean update(Feature feature) {
    Feature stored = features.get(feature.id());
    if (stored == null || stored.version() != feature.version()) {
      return false;
    }
    features.put(
        feature.id(),
        new Feature(
            feature.id(),
            feature.sessionId(),
            feature.externalId(),
            feature.title(),
            feature.description(),
            feature.criteria(),
            feature.markedForReview(),
            feature.reviewReason(),
            feature.deletedAt(),
            feature.version() + 1));
    return true;
  }

  @Override
  public boolean externalIdTaken(SessionId sessionId, String externalId, UUID exceptFeatureId) {
    return features.values().stream()
        .anyMatch(
            f ->
                f.sessionId().equals(sessionId)
                    && !f.isDeleted()
                    && !f.id().equals(exceptFeatureId)
                    && f.externalId()
                        .toLowerCase(Locale.ROOT)
                        .equals(externalId.toLowerCase(Locale.ROOT)));
  }

  // --- ChangeLogRepository --------------------------------------------------------------------

  @Override
  public void append(ChangeLogEntry entry) {
    if (openTransactions == 0) {
      throw new IllegalStateException(
          "L'historique s'écrit dans la transaction de la modification");
    }
    changeLogWritesInTransaction++;
    changeLog.add(entry);
  }

  public int changeLogWrites() {
    return changeLogWritesInTransaction;
  }
}
