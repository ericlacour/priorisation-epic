package com.priorisationepic.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.Role;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.Tokens;
import com.priorisationepic.domain.method.MethodRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class SessionConnectionUseCaseTest {

  private static final String RAW = "k3Jx9QvT2mLpZ8wR4nYb7A";
  private static final SessionId SESSION = new SessionId(RAW);
  private static final UUID ALICE = UUID.randomUUID();

  private final MutableClock clock = new MutableClock(Instant.parse("2026-10-12T08:00:00Z"));
  private final RecordingBroadcaster broadcaster = new RecordingBroadcaster();
  private final InMemorySessionRepository sessions = new InMemorySessionRepository();
  private final InMemoryParticipantRepository participants = new InMemoryParticipantRepository();
  private final Map<UUID, Instant> lastSeen = participants.lastSeen;

  private final SessionConnectionUseCase useCase =
      new SessionConnectionUseCase(
          sessions,
          participants,
          broadcaster,
          new SessionLocks(),
          new InMemoryTransactions(),
          clock::instant);

  @BeforeEach
  void seed() {
    sessions.insert(
        Session.create(
            MethodRegistry.standard(),
            SESSION,
            "Atelier",
            null,
            Tokens.hash("animation"),
            Pseudo.of("Alice"),
            clock.instant()));
    // Alice est FACILITATOR en base : le rôle seul ne donne aucun droit sans jeton d'animation.
    participants.insert(
        new Participant(
            ALICE,
            SESSION,
            Pseudo.of("Alice"),
            Role.FACILITATOR,
            null,
            Tokens.hash("alice-token"),
            clock.instant(),
            clock.instant(),
            0));
    participants.lastSeenWrites = 0;
    lastSeen.clear();
  }

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
  void aFirstConnectionAttachesAndPublishesTheNewPresenceToEveryone() {
    ConnectResult result = useCase.connect(RAW, "alice-token", null, "c1");

    assertThat(result).isEqualTo(new ConnectResult.Connected(ALICE, false, false));
    assertThat(broadcaster.attached.get("c1").facilitator()).isFalse();
    assertThat(broadcaster.published).containsExactly(SESSION);
    assertThat(broadcaster.publishedTo).isEmpty();
    assertThat(broadcaster.errors).isEmpty();
    assertThat(lastSeen.get(ALICE)).isEqualTo(clock.instant());
  }

  @Test
  void aSecondConnectionOfTheSameParticipantOnlyGetsItsOwnState() {
    useCase.connect(RAW, "alice-token", null, "c1");
    broadcaster.published.clear();

    useCase.connect(RAW, "alice-token", null, "c2");

    assertThat(broadcaster.published).isEmpty();
    assertThat(broadcaster.publishedTo).containsExactly("c2");
  }

  @Test
  void onlyTheLastClosedConnectionPublishesTheAbsence() {
    useCase.connect(RAW, "alice-token", null, "c1");
    useCase.connect(RAW, "alice-token", null, "c2");
    broadcaster.published.clear();

    useCase.disconnect(SESSION, ALICE, "c1");
    assertThat(broadcaster.published).isEmpty();

    useCase.disconnect(SESSION, ALICE, "c2");
    assertThat(broadcaster.published).containsExactly(SESSION);
  }

  @Test
  void aValidAnimationTokenMakesTheConnectionTheFacilitators() {
    ConnectResult result = useCase.connect(RAW, "alice-token", "animation", "c1");

    assertThat(result).isEqualTo(new ConnectResult.Connected(ALICE, true, false));
    assertThat(broadcaster.attached.get("c1").facilitator()).isTrue();
    assertThat(broadcaster.errors).isEmpty();
  }

  @Test
  void theAnimationLinkOpenedByAnotherParticipantTakesTheRoleOverFromTheFormerFacilitator() {
    UUID bob = UUID.randomUUID();
    participants.insert(
        com.priorisationepic.domain.Participant.join(
            bob,
            SESSION,
            com.priorisationepic.domain.Pseudo.of("bob"),
            com.priorisationepic.domain.Role.PARTICIPANT,
            com.priorisationepic.domain.Tokens.hash("bob-token"),
            clock.instant()));
    useCase.connect(RAW, "alice-token", "animation", "c1");
    broadcaster.published.clear();
    long version = sessions.find(SESSION).orElseThrow().version();

    ConnectResult result = useCase.connect(RAW, "bob-token", "animation", "c2");

    assertThat(result).isEqualTo(new ConnectResult.Connected(bob, true, false));
    assertThat(participants.find(bob).orElseThrow().role())
        .isEqualTo(com.priorisationepic.domain.Role.FACILITATOR);
    assertThat(participants.find(ALICE).orElseThrow().role())
        .isEqualTo(com.priorisationepic.domain.Role.PARTICIPANT);
    assertThat(broadcaster.attached.get("c1").facilitator()).isFalse();
    assertThat(broadcaster.attached.get("c2").facilitator()).isTrue();
    assertThat(broadcaster.published).containsExactly(SESSION);
    assertThat(sessions.find(SESSION).orElseThrow().version()).isEqualTo(version + 1);
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
    int before = participants.lastSeenWrites;
    useCase.disconnect(SESSION, ALICE, "ghost");
    assertThat(participants.lastSeenWrites).isEqualTo(before);
  }

  @Test
  void touchWritesLastSeenAtMostEvery30Seconds() {
    useCase.connect(RAW, "alice-token", null, "c1");
    int afterConnect = participants.lastSeenWrites;

    clock.advance(Duration.ofSeconds(10));
    useCase.touch(ALICE);
    clock.advance(Duration.ofSeconds(10));
    useCase.touch(ALICE);
    assertThat(participants.lastSeenWrites).isEqualTo(afterConnect);

    clock.advance(Duration.ofSeconds(10));
    useCase.touch(ALICE);
    assertThat(participants.lastSeenWrites).isEqualTo(afterConnect + 1);
    assertThat(lastSeen.get(ALICE)).isEqualTo(clock.instant());
  }

  @Test
  void touchWritesStraightAwayForAParticipantNotSeenYet() {
    useCase.touch(ALICE);
    assertThat(participants.lastSeenWrites).isEqualTo(1);
  }
}
