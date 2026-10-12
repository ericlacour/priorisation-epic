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
  void aValidTokenAttachesAndSendsTheStateToThatConnectionOnly() {
    ConnectResult result = useCase.connect(RAW, "alice-token", null, "c1");

    assertThat(result).isEqualTo(new ConnectResult.Connected(ALICE, false, false));
    assertThat(broadcaster.attached.get("c1").facilitator()).isFalse();
    assertThat(broadcaster.publishedTo).containsExactly("c1");
    assertThat(broadcaster.published).isEmpty();
    assertThat(broadcaster.errors).isEmpty();
    assertThat(lastSeen.get(ALICE)).isEqualTo(clock.instant());
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
  }

  @Test
  void disconnectingTheLastConnectionRecordsLastSeen() {
    useCase.connect(RAW, "alice-token", null, "c1");
    useCase.connect(RAW, "alice-token", null, "c2");
    clock.advance(Duration.ofMinutes(5));

    useCase.disconnect(SESSION, ALICE, "c1");
    assertThat(lastSeen.get(ALICE)).isNotEqualTo(clock.instant());

    useCase.disconnect(SESSION, ALICE, "c2");
    assertThat(lastSeen.get(ALICE)).isEqualTo(clock.instant());
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
