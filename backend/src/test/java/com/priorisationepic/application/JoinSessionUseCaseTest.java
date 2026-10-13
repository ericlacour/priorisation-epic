package com.priorisationepic.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.InvalidPseudoException;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.Role;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.Tokens;
import com.priorisationepic.domain.method.MethodRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class JoinSessionUseCaseTest {

  private static final Duration ABSENCE = Duration.ofMinutes(10);

  private final MutableClock clock = new MutableClock(Instant.parse("2026-10-12T08:00:00Z"));
  private final InMemoryStore store = new InMemoryStore();
  private final RecordingBroadcaster broadcaster = new RecordingBroadcaster();
  private final IdGenerator ids = new IdGenerator(new Random(11));
  private final JoinSessionUseCase join =
      new JoinSessionUseCase(
          store, store, broadcaster, new SessionLocks(), ids, clock::instant, store, ABSENCE);

  private SessionId session;
  private CreateSessionUseCase.Created created;

  @BeforeEach
  void createSession() {
    created =
        new CreateSessionUseCase(
                store, store, MethodRegistry.standard(), ids, clock::instant, store)
            .create(new CreateSessionUseCase.Command("Atelier", "Alice", null, null));
    session = created.sessionId();
  }

  private Participant byPseudo(String pseudo) {
    return store.list(session).stream()
        .filter(p -> p.pseudo().value().equals(pseudo))
        .findFirst()
        .orElseThrow();
  }

  @Test
  void aNewcomerGetsAParticipantTokenAndIsNeverTheFacilitator() {
    JoinSessionUseCase.Joined joined = join.join(session.value(), " Bob ", "Product Owner");

    Participant bob = byPseudo("Bob");
    assertThat(bob.role()).isEqualTo(Role.PARTICIPANT);
    assertThat(bob.businessRole()).isEqualTo("Product Owner");
    assertThat(bob.tokenHash()).isEqualTo(Tokens.hash(joined.participantToken()));
    assertThat(joined.toString()).doesNotContain(joined.participantToken());
    assertThat(store.list(session).stream().filter(Participant::isFacilitator)).hasSize(1);
  }

  @Test
  void everyoneIsToldAboutTheNewcomer() {
    join.join(session.value(), "Bob", null);

    assertThat(broadcaster.published).containsExactly(session);
  }

  @Test
  void aPseudoIsUniqueIgnoringCase() {
    assertThatThrownBy(() -> join.join(session.value(), "ALICE", null))
        .isInstanceOf(PseudoTakenException.class);
    assertThatThrownBy(() -> join.join(session.value(), "alice", null))
        .isInstanceOf(PseudoTakenException.class);

    assertThat(store.list(session)).hasSize(1);
    assertThat(broadcaster.published).isEmpty();
  }

  @Test
  void aPseudoIsRefusedWhileItsOwnerIsOnline() {
    join.join(session.value(), "Bob", null);
    Participant bob = byPseudo("Bob");
    broadcaster.attach("c1", session, bob.id(), false);
    clock.advance(Duration.ofHours(1));

    assertThatThrownBy(() -> join.join(session.value(), "bob", null))
        .isInstanceOf(PseudoTakenException.class);
  }

  @Test
  void aPseudoIsRefusedBeforeTenMinutesOfAbsence() {
    join.join(session.value(), "Bob", null);
    clock.advance(Duration.ofMinutes(9).plusSeconds(59));

    assertThatThrownBy(() -> join.join(session.value(), "Bob", null))
        .isInstanceOf(PseudoTakenException.class);
  }

  @Test
  void aPseudoIsTakenOverAfterTenMinutesOfAbsenceKeepingTheParticipantAndTheVotes() {
    JoinSessionUseCase.Joined first = join.join(session.value(), "Bob", null);
    Participant before = byPseudo("Bob");
    clock.advance(ABSENCE);

    JoinSessionUseCase.Joined second = join.join(session.value(), "BOB", null);

    Participant after = byPseudo("Bob");
    assertThat(after.id()).isEqualTo(before.id());
    assertThat(store.list(session)).hasSize(2);
    assertThat(second.participantToken()).isNotEqualTo(first.participantToken());
    assertThat(store.findByToken(session, first.participantToken())).isEmpty();
    assertThat(store.findByToken(session, second.participantToken())).isPresent();
    assertThat(after.lastSeenAt()).isEqualTo(clock.instant());
  }

  @Test
  void theFacilitatorRoleIsNeverTakenOverByPseudo() {
    clock.advance(Duration.ofDays(1));

    assertThatThrownBy(() -> join.join(session.value(), "Alice", null))
        .isInstanceOf(PseudoTakenException.class);
    assertThat(store.findByToken(session, created.participantToken())).isPresent();
  }

  @Test
  void aMalformedOrUnknownSessionIsNotFound() {
    assertThatThrownBy(() -> join.join("bad", "Bob", null))
        .isInstanceOf(SessionNotFoundException.class);
    assertThatThrownBy(() -> join.join(null, "Bob", null))
        .isInstanceOf(SessionNotFoundException.class);
    assertThatThrownBy(() -> join.join("A".repeat(22), "Bob", null))
        .isInstanceOf(SessionNotFoundException.class);
  }

  @Test
  void anInvalidPseudoIsRefused() {
    assertThatThrownBy(() -> join.join(session.value(), "  ", null))
        .isInstanceOf(InvalidPseudoException.class);
    assertThatThrownBy(() -> join.join(session.value(), "x".repeat(41), null))
        .isInstanceOf(InvalidPseudoException.class);
  }
}
