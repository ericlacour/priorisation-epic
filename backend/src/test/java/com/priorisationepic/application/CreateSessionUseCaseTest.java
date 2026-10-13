package com.priorisationepic.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.InvalidPseudoException;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.Role;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionStatus;
import com.priorisationepic.domain.Tokens;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.method.UnknownMethodException;
import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.domain.scale.ScaleType;
import java.time.Instant;
import java.util.Random;
import org.junit.jupiter.api.Test;

class CreateSessionUseCaseTest {

  private final MutableClock clock = new MutableClock(Instant.parse("2026-10-12T08:00:00Z"));
  private final InMemoryStore store = new InMemoryStore();
  private final CreateSessionUseCase useCase =
      new CreateSessionUseCase(
          store,
          store,
          MethodRegistry.standard(),
          new IdGenerator(new Random(7)),
          clock::instant,
          store);

  private CreateSessionUseCase.Created create(String method, Scale scale) {
    return useCase.create(new CreateSessionUseCase.Command("Atelier Q4", "  Éric ", method, scale));
  }

  @Test
  void theCreatorBecomesTheOnlyFacilitatorAndGetsBothTokens() {
    CreateSessionUseCase.Created created = create(null, null);

    Participant creator = store.list(created.sessionId()).getFirst();
    assertThat(store.list(created.sessionId())).hasSize(1);
    assertThat(creator.role()).isEqualTo(Role.FACILITATOR);
    assertThat(creator.pseudo().value()).isEqualTo("Éric");
    assertThat(created.participantToken()).isNotBlank().isNotEqualTo(created.animationToken());
    assertThat(store.animationTokenMatches(created.sessionId(), created.animationToken())).isTrue();
    assertThat(store.findByToken(created.sessionId(), created.participantToken())).isPresent();
  }

  @Test
  void onlyTheHashesOfTheTokensAreStored() {
    CreateSessionUseCase.Created created = create(null, null);

    assertThat(store.animationHashes.get(created.sessionId()))
        .isEqualTo(Tokens.hash(created.animationToken()))
        .doesNotContain(created.animationToken());
    assertThat(store.list(created.sessionId()).getFirst().tokenHash())
        .isEqualTo(Tokens.hash(created.participantToken()));
    assertThat(created.toString())
        .doesNotContain(created.participantToken(), created.animationToken());
  }

  @Test
  void aNewSessionStartsInPreparationWithWsjfVersion1AndTheDefaultScale() {
    Session session = store.find(create(null, null).sessionId()).orElseThrow();

    assertThat(session.status()).isEqualTo(SessionStatus.PREPARATION);
    assertThat(session.method()).isEqualTo("WSJF");
    assertThat(session.methodVersion()).isEqualTo(1);
    assertThat(session.scale()).isEqualTo(Scale.defaultScale());
    assertThat(session.createdAt()).isEqualTo(clock.instant());
    assertThat(session.createdBy().value()).isEqualTo("Éric");
    assertThat(session.version()).isZero();
  }

  @Test
  void anExplicitMethodAndScaleAreKept() {
    Session session =
        store.find(create("WSJF", new Scale(ScaleType.CONTINUOUS, 20)).sessionId()).orElseThrow();

    assertThat(session.method()).isEqualTo("WSJF");
    assertThat(session.scale().max()).isEqualTo(20);
  }

  @Test
  void anUnknownMethodIsRefusedAndNothingIsStored() {
    assertThatThrownBy(() -> create("RICE", null)).isInstanceOf(UnknownMethodException.class);

    assertThat(store.sessions).isEmpty();
    assertThat(store.participants).isEmpty();
  }

  @Test
  void anInvalidPseudoOrNameIsRefusedAndNothingIsStored() {
    assertThatThrownBy(
            () -> useCase.create(new CreateSessionUseCase.Command("Atelier", "   ", null, null)))
        .isInstanceOf(InvalidPseudoException.class);
    assertThatThrownBy(
            () -> useCase.create(new CreateSessionUseCase.Command("", "Éric", null, null)))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(
            () ->
                useCase.create(
                    new CreateSessionUseCase.Command("x".repeat(121), "Éric", null, null)))
        .isInstanceOf(IllegalArgumentException.class);

    assertThat(store.sessions).isEmpty();
    assertThat(store.participants).isEmpty();
  }

  @Test
  void theSessionAndItsFacilitatorAreWrittenInOneTransaction() {
    store.rollbackOnFailure = true;
    CreateSessionUseCase failing =
        new CreateSessionUseCase(
            store,
            new FailingParticipants(store),
            MethodRegistry.standard(),
            new IdGenerator(new Random(7)),
            clock::instant,
            store);

    assertThatThrownBy(
            () -> failing.create(new CreateSessionUseCase.Command("Atelier", "Éric", null, null)))
        .isInstanceOf(IllegalStateException.class);

    assertThat(store.sessions).isEmpty();
  }

  /** Participants dont l'écriture échoue, pour vérifier l'annulation de la transaction. */
  private record FailingParticipants(InMemoryStore store) implements ParticipantRepository {
    @Override
    public java.util.Optional<com.priorisationepic.domain.ParticipantIdentity> findByToken(
        com.priorisationepic.domain.SessionId id, String token) {
      return store.findByToken(id, token);
    }

    @Override
    public void updateLastSeen(java.util.UUID id, Instant at) {
      store.updateLastSeen(id, at);
    }

    @Override
    public void insert(Participant participant) {
      throw new IllegalStateException("panne");
    }

    @Override
    public java.util.Optional<Participant> findByPseudo(
        com.priorisationepic.domain.SessionId id, com.priorisationepic.domain.Pseudo pseudo) {
      return store.findByPseudo(id, pseudo);
    }

    @Override
    public java.util.Optional<Participant> findById(java.util.UUID id) {
      return store.findById(id);
    }

    @Override
    public java.util.List<Participant> list(com.priorisationepic.domain.SessionId id) {
      return store.list(id);
    }

    @Override
    public void replaceToken(java.util.UUID id, String hash, Instant at) {
      store.replaceToken(id, hash, at);
    }
  }
}
