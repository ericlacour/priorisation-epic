package com.priorisationepic.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.application.CreateSessionUseCase.Command;
import com.priorisationepic.application.CreateSessionUseCase.Created;
import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.InvalidPseudoException;
import com.priorisationepic.domain.InvalidSessionException;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.Role;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionStatus;
import com.priorisationepic.domain.Tokens;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.method.UnknownMethodException;
import com.priorisationepic.domain.scale.InvalidScaleException;
import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.testmethod.FakeTwoCriteriaMethod;
import java.time.Instant;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.Test;

class CreateSessionUseCaseTest {

  private static final Instant NOW = Instant.parse("2026-10-12T08:00:00Z");

  private final InMemorySessionRepository sessions = new InMemorySessionRepository();
  private final InMemoryParticipantRepository participants = new InMemoryParticipantRepository();
  private final InMemoryTransactions transactions = new InMemoryTransactions();
  private final MethodRegistry registry =
      new MethodRegistry(
          List.of(MethodRegistry.standard().defaultMethod(), new FakeTwoCriteriaMethod()), "WSJF");
  private final CreateSessionUseCase useCase =
      new CreateSessionUseCase(
          registry,
          sessions,
          participants,
          transactions,
          () -> NOW,
          new IdGenerator(new Random(7)));

  private Created create(String name, String pseudo) {
    return useCase.create(new Command(name, pseudo, null, null));
  }

  @Test
  void theCreatorBecomesTheFacilitatorOfANewSessionInPreparation() {
    Created created = create("PI 27", "eric");

    Session session = sessions.find(created.sessionId()).orElseThrow();
    assertThat(session.name()).isEqualTo("PI 27");
    assertThat(session.status()).isEqualTo(SessionStatus.PREPARATION);
    assertThat(session.createdAt()).isEqualTo(NOW);
    assertThat(session.version()).isZero();
    Participant creator = participants.findAll(created.sessionId()).getFirst();
    assertThat(participants.findAll(created.sessionId())).hasSize(1);
    assertThat(creator.role()).isEqualTo(Role.FACILITATOR);
    assertThat(creator.pseudo().value()).isEqualTo("eric");
    assertThat(creator.joinedAt()).isEqualTo(NOW);
  }

  @Test
  void usesTheDefaultMethodAndScaleWhenNoneIsAsked() {
    Session session = sessions.find(create("S", "eric").sessionId()).orElseThrow();
    assertThat(session.method()).isEqualTo("WSJF");
    assertThat(session.methodVersion()).isEqualTo(1);
    assertThat(session.scale()).isEqualTo(Scale.defaultScale());
  }

  @Test
  void freezesTheAskedMethodInItsLatestVersion() {
    Created created = useCase.create(new Command("S", "eric", FakeTwoCriteriaMethod.KEY, null));
    Session session = sessions.find(created.sessionId()).orElseThrow();
    assertThat(session.method()).isEqualTo(FakeTwoCriteriaMethod.KEY);
    assertThat(session.methodVersion()).isEqualTo(1);
  }

  @Test
  void appliesTheAskedScale() {
    Created created = useCase.create(new Command("S", "eric", null, Scale.continuous(20)));
    assertThat(sessions.find(created.sessionId()).orElseThrow().scale())
        .isEqualTo(Scale.continuous(20));
  }

  @Test
  void refusesAnUnknownMethodAndCreatesNothing() {
    assertThatThrownBy(() -> useCase.create(new Command("S", "eric", "MOSCOW", null)))
        .isInstanceOf(UnknownMethodException.class);
    assertThat(sessions.sessions).isEmpty();
    assertThat(participants.participants).isEmpty();
  }

  @Test
  void refusesAnInvalidNameOrPseudoAndCreatesNothing() {
    assertThatThrownBy(() -> create("   ", "eric")).isInstanceOf(InvalidSessionException.class);
    assertThatThrownBy(() -> create("x".repeat(121), "eric"))
        .isInstanceOf(InvalidSessionException.class);
    assertThatThrownBy(() -> create("S", "  ")).isInstanceOf(InvalidPseudoException.class);
    assertThatThrownBy(() -> create("S", "p".repeat(41)))
        .isInstanceOf(InvalidPseudoException.class);
    assertThat(sessions.sessions).isEmpty();
    assertThat(participants.participants).isEmpty();
  }

  @Test
  void refusesAnInvalidScale() {
    assertThatThrownBy(
            () ->
                useCase.create(
                    new Command(
                        "S",
                        "eric",
                        null,
                        new Scale(com.priorisationepic.domain.scale.ScaleType.CONTINUOUS, 1))))
        .isInstanceOf(InvalidScaleException.class);
  }

  @Test
  void keepsOnlyTheHashesOfTheTwoTokens() {
    Created created = create("S", "eric");

    assertThat(created.participantToken()).isNotEqualTo(created.animationToken());
    assertThat(created.participantToken()).hasSizeBetween(1, 64);
    assertThat(created.animationToken()).hasSizeBetween(1, 64);

    Session session = sessions.find(created.sessionId()).orElseThrow();
    assertThat(session.animationTokenHash()).isEqualTo(Tokens.hash(created.animationToken()));
    assertThat(session.animationTokenHash()).isNotEqualTo(created.animationToken());
    Participant creator = participants.findAll(created.sessionId()).getFirst();
    assertThat(creator.participantTokenHash()).isEqualTo(Tokens.hash(created.participantToken()));
    assertThat(creator.participantTokenHash()).isNotEqualTo(created.participantToken());
    // le jeton d'animation ne sert pas de jeton de participant, ni l'inverse
    assertThat(sessions.animationTokenMatches(created.sessionId(), created.participantToken()))
        .isFalse();
    assertThat(participants.findByToken(created.sessionId(), created.animationToken())).isEmpty();
    assertThat(participants.findByToken(created.sessionId(), created.participantToken()))
        .isPresent();
  }

  @Test
  void neverShowsTheTokensInItsTextForm() {
    Created created = create("S", "eric");
    assertThat(created.toString())
        .doesNotContain(created.participantToken())
        .doesNotContain(created.animationToken());
  }

  @Test
  void eachSessionGetsItsOwnIdentifierAndTokens() {
    Created first = create("A", "eric");
    Created second = create("B", "eric");
    assertThat(first.sessionId()).isNotEqualTo(second.sessionId());
    assertThat(first.participantToken()).isNotEqualTo(second.participantToken());
    assertThat(first.animationToken()).isNotEqualTo(second.animationToken());
  }

  @Test
  void writesTheSessionAndItsFacilitatorInOneTransaction() {
    create("S", "eric");
    assertThat(transactions.count).isEqualTo(1);
  }
}
