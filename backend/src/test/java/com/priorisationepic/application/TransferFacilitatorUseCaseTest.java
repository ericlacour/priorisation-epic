package com.priorisationepic.application;

import static com.priorisationepic.application.RoundFixture.assertRejected;
import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.domain.Role;
import com.priorisationepic.domain.Tokens;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class TransferFacilitatorUseCaseTest {

  private final RoundFixture fx = new RoundFixture();
  private final TransferFacilitatorUseCase useCase =
      new TransferFacilitatorUseCase(
          fx.sessions, fx.participants, fx.broadcaster, fx.locks, fx.transactions, fx.ids);

  private void connect(String connection, UUID who, boolean facilitator) {
    fx.broadcaster.attach(connection, RoundFixture.SESSION, who, facilitator);
  }

  private Role roleOf(UUID who) {
    return fx.participants.find(who).orElseThrow().role();
  }

  @Test
  void aTransferToAnOfflineParticipantIsRefusedWithoutAnyChange() {
    connect("c-eric", fx.eric, true);
    long version = fx.sessionVersion();
    String hash = fx.sessions.find(RoundFixture.SESSION).orElseThrow().animationTokenHash();

    assertRejected(
        useCase.transfer(RoundFixture.SESSION, fx.facilitator, fx.bob),
        ErrorCode.PARTICIPANT_OFFLINE);

    assertThat(roleOf(fx.eric)).isEqualTo(Role.FACILITATOR);
    assertThat(roleOf(fx.bob)).isEqualTo(Role.PARTICIPANT);
    assertThat(fx.sessionVersion()).isEqualTo(version);
    assertThat(fx.sessions.find(RoundFixture.SESSION).orElseThrow().animationTokenHash())
        .isEqualTo(hash);
    assertThat(fx.broadcaster.handovers).isEmpty();
    assertThat(fx.broadcaster.published).isEmpty();
  }

  @Test
  void aValidTransferSwapsTheRolesAndHandsTheNewTokenToTheBeneficiaryOnly() {
    connect("c-eric", fx.eric, true);
    connect("c-alice", fx.alice, false);
    String oldHash = fx.sessions.find(RoundFixture.SESSION).orElseThrow().animationTokenHash();

    assertThat(useCase.transfer(RoundFixture.SESSION, fx.facilitator, fx.alice))
        .isEqualTo(Outcome.CHANGED);

    assertThat(roleOf(fx.alice)).isEqualTo(Role.FACILITATOR);
    assertThat(roleOf(fx.eric)).isEqualTo(Role.PARTICIPANT);
    assertThat(fx.broadcaster.attached.get("c-alice").facilitator()).isTrue();
    assertThat(fx.broadcaster.attached.get("c-eric").facilitator()).isFalse();
    assertThat(fx.broadcaster.handovers).hasSize(1);
    String handover = fx.broadcaster.handovers.get(0);
    assertThat(handover).startsWith(fx.alice + ":");
    String token = handover.substring(handover.indexOf(':') + 1);
    String newHash = fx.sessions.find(RoundFixture.SESSION).orElseThrow().animationTokenHash();
    assertThat(newHash).isEqualTo(Tokens.hash(token)).isNotEqualTo(oldHash);
    assertThat(fx.broadcaster.published).containsExactly(RoundFixture.SESSION);
    assertThat(
            fx.participants.findAll(RoundFixture.SESSION).stream()
                .filter(p -> p.role() == Role.FACILITATOR))
        .hasSize(1);
  }

  @Test
  void onlyTheFacilitatorCanTransfer() {
    connect("c-bob", fx.bob, false);
    assertRejected(
        useCase.transfer(RoundFixture.SESSION, fx.aliceActor, fx.bob), ErrorCode.FORBIDDEN);
    assertThat(roleOf(fx.bob)).isEqualTo(Role.PARTICIPANT);
  }

  @Test
  void anUnknownBeneficiaryIsRefused() {
    assertRejected(
        useCase.transfer(RoundFixture.SESSION, fx.facilitator, UUID.randomUUID()),
        ErrorCode.UNKNOWN_PARTICIPANT);
  }

  @Test
  void transferringToOneselfChangesNothing() {
    connect("c-eric", fx.eric, true);
    assertThat(useCase.transfer(RoundFixture.SESSION, fx.facilitator, fx.eric))
        .isEqualTo(Outcome.UNCHANGED);
    assertThat(fx.broadcaster.handovers).isEmpty();
  }
}
