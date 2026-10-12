package com.priorisationepic.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.application.JoinSessionUseCase.Command;
import com.priorisationepic.application.JoinSessionUseCase.Result;
import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.InvalidParticipantException;
import com.priorisationepic.domain.InvalidPseudoException;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.Role;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.Tokens;
import com.priorisationepic.domain.method.MethodRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.Random;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class JoinSessionUseCaseTest {

  private static final SessionId SESSION = new SessionId("k3Jx9QvT2mLpZ8wR4nYb7A");
  private static final Duration ABSENCE = Duration.ofMinutes(10);

  private final MutableClock clock = new MutableClock(Instant.parse("2026-10-12T08:00:00Z"));
  private final InMemorySessionRepository sessions = new InMemorySessionRepository();
  private final InMemoryParticipantRepository participants = new InMemoryParticipantRepository();
  private final RecordingBroadcaster broadcaster = new RecordingBroadcaster();
  private final InMemoryTransactions transactions = new InMemoryTransactions();
  private final JoinSessionUseCase useCase =
      new JoinSessionUseCase(
          sessions,
          participants,
          broadcaster,
          new SessionLocks(),
          transactions,
          clock::instant,
          new IdGenerator(new Random(11)),
          ABSENCE);

  private UUID eric;

  @BeforeEach
  void seed() {
    sessions.insert(
        Session.create(
            MethodRegistry.standard(),
            SESSION,
            "Atelier",
            null,
            Tokens.hash("animation"),
            Pseudo.of("eric"),
            clock.instant()));
    eric = UUID.randomUUID();
    participants.insert(
        Participant.join(
            eric,
            SESSION,
            Pseudo.of("eric"),
            Role.FACILITATOR,
            Tokens.hash("eric-token"),
            clock.instant()));
  }

  private Result join(String pseudo) {
    return useCase.join(SESSION, new Command(pseudo, null));
  }

  private String tokenOf(Result result) {
    return ((Result.Joined) result).participantToken();
  }

  @Test
  void aNewcomerJoinsAsAParticipantWithAToken() {
    Result result = join("alice");

    assertThat(result).isInstanceOf(Result.Joined.class);
    assertThat(((Result.Joined) result).reclaimed()).isFalse();
    Participant alice = participants.findByPseudo(SESSION, Pseudo.of("alice")).orElseThrow();
    assertThat(alice.role()).isEqualTo(Role.PARTICIPANT);
    assertThat(alice.participantTokenHash()).isEqualTo(Tokens.hash(tokenOf(result)));
    assertThat(alice.participantTokenHash()).isNotEqualTo(tokenOf(result));
    assertThat(participants.findByToken(SESSION, tokenOf(result)).orElseThrow().id())
        .isEqualTo(alice.id());
  }

  @Test
  void theNewParticipantIsAnnouncedToEveryoneAndTheSessionVersionGoesUp() {
    join("alice");
    assertThat(broadcaster.published).containsExactly(SESSION);
    assertThat(sessions.find(SESSION).orElseThrow().version()).isEqualTo(1);
    assertThat(transactions.count).isEqualTo(1);
  }

  @Test
  void keepsAnOptionalBusinessRoleTrimmedOrNothingWhenBlank() {
    useCase.join(SESSION, new Command("alice", "  Tech Lead "));
    useCase.join(SESSION, new Command("bob", "   "));
    useCase.join(SESSION, new Command("carol", null));

    assertThat(participants.findByPseudo(SESSION, Pseudo.of("alice")).orElseThrow().businessRole())
        .isEqualTo("Tech Lead");
    assertThat(participants.findByPseudo(SESSION, Pseudo.of("bob")).orElseThrow().businessRole())
        .isNull();
    assertThat(participants.findByPseudo(SESSION, Pseudo.of("carol")).orElseThrow().businessRole())
        .isNull();
  }

  @Test
  void refusesAPseudoOrBusinessRoleThatIsTooLong() {
    assertThatThrownBy(() -> join("   ")).isInstanceOf(InvalidPseudoException.class);
    assertThatThrownBy(() -> join("p".repeat(41))).isInstanceOf(InvalidPseudoException.class);
    assertThatThrownBy(() -> useCase.join(SESSION, new Command("alice", "r".repeat(41))))
        .isInstanceOf(InvalidParticipantException.class);
    assertThat(participants.findAll(SESSION)).hasSize(1);
    assertThat(broadcaster.published).isEmpty();
  }

  @Test
  void aPseudoIsRefusedWhenTakenWithoutCaseAndNothingChanges() {
    assertThat(join("ALICE")).isInstanceOf(Result.Joined.class);
    int before = participants.participants.size();

    assertThat(join("alice")).isInstanceOf(Result.PseudoTaken.class);
    assertThat(join("  Alice ")).isInstanceOf(Result.PseudoTaken.class);
    assertThat(participants.participants).hasSize(before);
    assertThat(broadcaster.published).hasSize(1);
  }

  @Test
  void aTakenPseudoIsRefusedBeforeTenMinutesOfAbsence() {
    Result first = join("alice");
    UUID alice = participants.findByPseudo(SESSION, Pseudo.of("alice")).orElseThrow().id();
    participants.updateLastSeen(alice, clock.instant());
    participants.participants.put(
        alice, participants.participants.get(alice).seen(clock.instant()));

    clock.advance(Duration.ofMinutes(9).plusSeconds(59));

    assertThat(join("alice")).isInstanceOf(Result.PseudoTaken.class);
    assertThat(participants.findByToken(SESSION, tokenOf(first))).isPresent();
  }

  @Test
  void aPseudoIsReclaimedAfterTenMinutesOfAbsenceWithTheSameParticipantAndANewToken() {
    Result first = join("alice");
    UUID alice = participants.findByPseudo(SESSION, Pseudo.of("alice")).orElseThrow().id();

    clock.advance(ABSENCE);
    Result second = join("alice");

    assertThat(second).isInstanceOf(Result.Joined.class);
    assertThat(((Result.Joined) second).reclaimed()).isTrue();
    // même participant (donc mêmes votes), nouveau jeton, ancien jeton invalide
    assertThat(participants.findByToken(SESSION, tokenOf(second)).orElseThrow().id())
        .isEqualTo(alice);
    assertThat(participants.findByToken(SESSION, tokenOf(first))).isEmpty();
    assertThat(participants.findAll(SESSION)).hasSize(2);
    assertThat(participants.find(alice).orElseThrow().lastSeenAt()).isEqualTo(clock.instant());
  }

  @Test
  void aPseudoWithAnOpenConnectionIsNeverReclaimed() {
    join("alice");
    UUID alice = participants.findByPseudo(SESSION, Pseudo.of("alice")).orElseThrow().id();
    broadcaster.attach("c1", SESSION, alice, false);

    clock.advance(Duration.ofHours(2));

    assertThat(join("alice")).isInstanceOf(Result.PseudoTaken.class);
  }

  @Test
  void theFacilitatorRoleIsNeverTakenOverByPseudo() {
    clock.advance(Duration.ofDays(1));

    assertThat(join("eric")).isInstanceOf(Result.PseudoTaken.class);
    assertThat(participants.find(eric).orElseThrow().participantTokenHash())
        .isEqualTo(Tokens.hash("eric-token"));
    assertThat(participants.find(eric).orElseThrow().role()).isEqualTo(Role.FACILITATOR);
  }

  @Test
  void anUnknownSessionIsNotFound() {
    Result result = useCase.join(new SessionId("A".repeat(22)), new Command("alice", null));
    assertThat(result).isInstanceOf(Result.SessionNotFound.class);
    assertThat(participants.findAll(SESSION)).hasSize(1);
    assertThat(broadcaster.published).isEmpty();
  }

  @Test
  void neverShowsTheTokenInItsTextForm() {
    Result result = join("alice");
    assertThat(result.toString()).doesNotContain(tokenOf(result));
  }
}
