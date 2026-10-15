package com.priorisationepic.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.domain.ParticipantIdentity;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.Role;
import com.priorisationepic.domain.SessionId;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SessionConnectionUseCaseTest {

  private static final String RAW = "k3Jx9QvT2mLpZ8wR4nYb7A";
  private static final SessionId SESSION = new SessionId(RAW);
  private static final UUID ALICE = UUID.randomUUID();

  private final MutableClock clock = new MutableClock(Instant.parse("2026-10-12T08:00:00Z"));
  private final RecordingBroadcaster broadcaster = new RecordingBroadcaster();
  private final Map<UUID, Instant> lastSeen = new HashMap<>();
  private int lastSeenWrites;

  private final SessionRepository sessions =
      new SessionRepository() {
        @Override
        public boolean exists(SessionId id) {
          return id.equals(SESSION);
        }

        @Override
        public boolean animationTokenMatches(SessionId id, String token) {
          return token.equals("animation");
        }

        @Override
        public void insert(com.priorisationepic.domain.Session session, String hash) {
          throw new UnsupportedOperationException();
        }

        @Override
        public Optional<com.priorisationepic.domain.Session> find(SessionId id) {
          throw new UnsupportedOperationException();
        }

        @Override
        public void incrementVersion(SessionId id) {
          throw new UnsupportedOperationException();
        }

        @Override
        public void updateSettings(
            SessionId id, String name, com.priorisationepic.domain.scale.Scale scale) {
          throw new UnsupportedOperationException();
        }
      };

  private final ParticipantRepository participants =
      new ParticipantRepository() {
        @Override
        public Optional<ParticipantIdentity> findByToken(SessionId id, String token) {
          return token.equals("alice-token") && id.equals(SESSION)
              ? Optional.of(new ParticipantIdentity(ALICE, Pseudo.of("Alice"), Role.FACILITATOR))
              : Optional.empty();
        }

        @Override
        public void updateLastSeen(UUID id, Instant at) {
          lastSeen.put(id, at);
          lastSeenWrites++;
        }

        @Override
        public void insert(com.priorisationepic.domain.Participant participant) {
          throw new UnsupportedOperationException();
        }

        @Override
        public Optional<com.priorisationepic.domain.Participant> findByPseudo(
            SessionId id, Pseudo pseudo) {
          throw new UnsupportedOperationException();
        }

        @Override
        public Optional<com.priorisationepic.domain.Participant> findById(UUID id) {
          throw new UnsupportedOperationException();
        }

        @Override
        public java.util.List<com.priorisationepic.domain.Participant> list(SessionId id) {
          throw new UnsupportedOperationException();
        }

        @Override
        public void replaceToken(UUID id, String hash, Instant at) {
          throw new UnsupportedOperationException();
        }
      };

  private final SessionConnectionUseCase useCase =
      new SessionConnectionUseCase(
          sessions, participants, broadcaster, new SessionLocks(), clock::instant);

  @Test
  void anUnknownOrMalformedSessionIsNotFound() {
    assertThat(useCase.connect(null, "alice-token", null, "c1"))
        .isInstanceOf(ConnectResult.SessionNotFound.class);
    assertThat(useCase.connect("bad", "alice-token", null, "c1"))
        .isInstanceOf(ConnectResult.SessionNotFound.class);
    assertThat(useCase.connect("A".repeat(22), "alice-token", null, "c1"))
        .isInstanceOf(ConnectResult.SessionNotFound.class);
    assertThat(broadcaster.attached).isEmpty();
  }

  @Test
  void anUnknownTokenIsRefusedAfterTheSessionCheck() {
    assertThat(useCase.connect(RAW, "nobody", null, "c1"))
        .isInstanceOf(ConnectResult.UnknownToken.class);
    assertThat(broadcaster.attached).isEmpty();
  }

  @Test
  void theFirstConnectionOfAParticipantTellsEveryoneThatTheyAreOnline() {
    ConnectResult result = useCase.connect(RAW, "alice-token", null, "c1");

    assertThat(result).isEqualTo(new ConnectResult.Connected(ALICE, false, false));
    assertThat(broadcaster.attached.get("c1").facilitator()).isFalse();
    assertThat(broadcaster.published).containsExactly(SESSION);
    assertThat(broadcaster.publishedTo).isEmpty();
    assertThat(broadcaster.errors).isEmpty();
    assertThat(lastSeen.get(ALICE)).isEqualTo(clock.instant());
  }

  @Test
  void anotherConnectionOfTheSameParticipantOnlyReceivesItsOwnState() {
    useCase.connect(RAW, "alice-token", null, "c1");
    broadcaster.published.clear();

    useCase.connect(RAW, "alice-token", null, "c2");

    assertThat(broadcaster.publishedTo).containsExactly("c2");
    assertThat(broadcaster.published).isEmpty();
  }

  @Test
  void aValidAnimationTokenMakesTheConnectionTheFacilitators() {
    ConnectResult result = useCase.connect(RAW, "alice-token", "animation", "c1");

    assertThat(result).isEqualTo(new ConnectResult.Connected(ALICE, true, false));
    assertThat(broadcaster.attached.get("c1").facilitator()).isTrue();
    assertThat(broadcaster.errors).isEmpty();
  }

  @Test
  void anInvalidAnimationTokenKeepsAPlainParticipantAndSendsForbidden() {
    ConnectResult result = useCase.connect(RAW, "alice-token", "wrong", "c1");

    assertThat(result).isEqualTo(new ConnectResult.Connected(ALICE, false, true));
    assertThat(broadcaster.attached.get("c1").facilitator()).isFalse();
    assertThat(broadcaster.errors).containsExactly("c1:FORBIDDEN");
  }

  @Test
  void theFacilitatorRoleAloneNeverGivesFacilitatorRights() {
    // Alice est FACILITATOR en base, mais sans jeton d'animation elle n'a aucun droit d'animateur.
    useCase.connect(RAW, "alice-token", null, "c1");
    assertThat(broadcaster.attached.get("c1").facilitator()).isFalse();
  }

  @Test
  void aClosedConnectionIsReported() {
    broadcaster.refuseAttach = true;
    assertThat(useCase.connect(RAW, "alice-token", null, "c1"))
        .isInstanceOf(ConnectResult.ConnectionClosed.class);
    assertThat(broadcaster.publishedTo).isEmpty();
    assertThat(broadcaster.published).isEmpty();
  }

  @Test
  void disconnectingTheLastConnectionRecordsLastSeen() {
    useCase.connect(RAW, "alice-token", null, "c1");
    useCase.connect(RAW, "alice-token", null, "c2");
    clock.advance(Duration.ofMinutes(5));

    broadcaster.published.clear();

    useCase.disconnect(SESSION, ALICE, "c1");
    assertThat(lastSeen.get(ALICE)).isNotEqualTo(clock.instant());
    assertThat(broadcaster.published).isEmpty();

    useCase.disconnect(SESSION, ALICE, "c2");
    assertThat(lastSeen.get(ALICE)).isEqualTo(clock.instant());
    // Hors ligne : les autres connexions de la session l'apprennent (FR-005).
    assertThat(broadcaster.published).containsExactly(SESSION);
  }

  @Test
  void disconnectingAnUnknownConnectionDoesNothing() {
    int before = lastSeenWrites;
    useCase.disconnect(SESSION, ALICE, "ghost");
    assertThat(lastSeenWrites).isEqualTo(before);
  }

  @Test
  void touchWritesLastSeenAtMostEvery30Seconds() {
    useCase.connect(RAW, "alice-token", null, "c1");
    int afterConnect = lastSeenWrites;

    clock.advance(Duration.ofSeconds(10));
    useCase.touch(ALICE);
    clock.advance(Duration.ofSeconds(10));
    useCase.touch(ALICE);
    assertThat(lastSeenWrites).isEqualTo(afterConnect);

    clock.advance(Duration.ofSeconds(10));
    useCase.touch(ALICE);
    assertThat(lastSeenWrites).isEqualTo(afterConnect + 1);
    assertThat(lastSeen.get(ALICE)).isEqualTo(clock.instant());
  }

  @Test
  void touchWritesStraightAwayForAParticipantNotSeenYet() {
    useCase.touch(ALICE);
    assertThat(lastSeenWrites).isEqualTo(1);
  }
}
