package com.priorisationepic.application;

import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.Role;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.Tokens;
import com.priorisationepic.domain.method.Criteria;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.scale.Scale;
import java.time.Instant;
import java.util.Map;
import java.util.Random;
import java.util.UUID;

/** Une session en cours avec un animateur (eric), deux participants et deux fonctionnalités. */
final class RoundFixture {

  static final SessionId SESSION = new SessionId("k3Jx9QvT2mLpZ8wR4nYb7A");

  final MutableClock clock = new MutableClock(Instant.parse("2026-10-12T08:00:00Z"));
  final MethodRegistry registry = MethodRegistry.standard();
  final InMemorySessionRepository sessions = new InMemorySessionRepository();
  final InMemoryParticipantRepository participants = new InMemoryParticipantRepository();
  final InMemoryFeatureRepository features = new InMemoryFeatureRepository();
  final InMemoryRoundRepository rounds = new InMemoryRoundRepository();
  final InMemoryTransactions transactions = new InMemoryTransactions();
  final RecordingBroadcaster broadcaster = new RecordingBroadcaster();
  final SessionLocks locks = new SessionLocks();
  final IdGenerator ids = new IdGenerator(new Random(3));

  final UUID eric = UUID.randomUUID();
  final UUID alice = UUID.randomUUID();
  final UUID bob = UUID.randomUUID();
  final Actor facilitator = new Actor(eric, true);
  final Actor aliceActor = new Actor(alice, false);
  final Actor bobActor = new Actor(bob, false);
  final Feature f1 = feature("F-1", Map.of("bv", 8, "tc", 5, "rrOe", 3, "js", 4));
  final Feature f2 = feature("F-2", Map.of("bv", 2, "tc", 2, "rrOe", 2, "js", 3));

  RoundFixture() {
    this(true);
  }

  RoundFixture(boolean started) {
    Session created =
        Session.create(
            registry,
            SESSION,
            "Atelier",
            null,
            Tokens.hash("animation"),
            Pseudo.of("eric"),
            clock.instant());
    sessions.insert(started ? created.start() : created);
    join(eric, "eric", Role.FACILITATOR);
    join(alice, "alice", Role.PARTICIPANT);
    join(bob, "bob", Role.PARTICIPANT);
    features.insert(f1);
    features.insert(f2);
  }

  private void join(UUID id, String pseudo, Role role) {
    participants.insert(
        Participant.join(
            id, SESSION, Pseudo.of(pseudo), role, Tokens.hash(pseudo), clock.instant()));
  }

  private Feature feature(String externalId, Map<String, Integer> values) {
    Criteria empty = Criteria.empty(registry.defaultMethod().definition());
    return Feature.create(
            UUID.randomUUID(),
            SESSION,
            externalId,
            "T " + externalId,
            null,
            empty,
            Scale.defaultScale())
        .withCriteriaChanges(values, Scale.defaultScale());
  }

  long sessionVersion() {
    return sessions.find(SESSION).orElseThrow().version();
  }

  RoundUseCase roundUseCase() {
    return new RoundUseCase(
        sessions,
        features,
        rounds,
        broadcaster,
        locks,
        transactions,
        clock::instant,
        ids,
        registry);
  }

  VoteUseCase voteUseCase() {
    return new VoteUseCase(
        sessions, rounds, broadcaster, locks, transactions, clock::instant, registry);
  }

  /** Ouvre un tour sur les fonctionnalités données et renvoie son identifiant. */
  UUID openRound(UUID... featureIds) {
    roundUseCase()
        .open(SESSION, facilitator, new RoundUseCase.Open(java.util.List.of(featureIds), null));
    return rounds.findAll(SESSION).getLast().id();
  }

  static void assertRejected(Outcome outcome, ErrorCode code) {
    org.assertj.core.api.Assertions.assertThat(outcome).isInstanceOf(Outcome.Rejected.class);
    org.assertj.core.api.Assertions.assertThat(((Outcome.Rejected) outcome).code()).isEqualTo(code);
  }
}
