package com.priorisationepic.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ParticipantTest {

  private static final SessionId SESSION = new SessionId("e".repeat(22));
  private static final Instant T0 = Instant.parse("2026-10-12T10:00:00Z");
  private static final Duration TIMEOUT = Duration.ofMinutes(10);

  private static Participant alice() {
    return Participant.join(
        UUID.randomUUID(), SESSION, Pseudo.of("Alice"), Role.PARTICIPANT, "hash", T0);
  }

  @Test
  void joinSetsTimestampsAndVersion() {
    Participant p = alice();
    assertThat(p.joinedAt()).isEqualTo(T0);
    assertThat(p.lastSeenAt()).isEqualTo(T0);
    assertThat(p.version()).isZero();
    assertThat(p.isFacilitator()).isFalse();
    assertThat(p.businessRole()).isNull();
  }

  @Test
  void facilitatorFlag() {
    Participant f =
        Participant.join(UUID.randomUUID(), SESSION, Pseudo.of("Bob"), Role.FACILITATOR, "h", T0);
    assertThat(f.isFacilitator()).isTrue();
  }

  @Test
  void requiresMandatoryFields() {
    UUID id = UUID.randomUUID();
    Pseudo pseudo = Pseudo.of("A");
    assertThatThrownBy(() -> Participant.join(null, SESSION, pseudo, Role.PARTICIPANT, "h", T0))
        .isInstanceOf(NullPointerException.class);
    assertThatThrownBy(() -> Participant.join(id, null, pseudo, Role.PARTICIPANT, "h", T0))
        .isInstanceOf(NullPointerException.class);
    assertThatThrownBy(() -> Participant.join(id, SESSION, null, Role.PARTICIPANT, "h", T0))
        .isInstanceOf(NullPointerException.class);
    assertThatThrownBy(() -> Participant.join(id, SESSION, pseudo, null, "h", T0))
        .isInstanceOf(NullPointerException.class);
    assertThatThrownBy(() -> Participant.join(id, SESSION, pseudo, Role.PARTICIPANT, null, T0))
        .isInstanceOf(NullPointerException.class);
    assertThatThrownBy(() -> Participant.join(id, SESSION, pseudo, Role.PARTICIPANT, "h", null))
        .isInstanceOf(NullPointerException.class);
  }

  @Test
  void seenUpdatesLastSeenOnly() {
    Participant p = alice();
    Participant later = p.seen(T0.plusSeconds(30));
    assertThat(later.lastSeenAt()).isEqualTo(T0.plusSeconds(30));
    assertThat(later.joinedAt()).isEqualTo(T0);
    assertThat(p.lastSeenAt()).isEqualTo(T0);
  }

  @Test
  void pseudoIsReclaimableAfterTenMinutesOfAbsence() {
    Participant p = alice();
    assertThat(p.canBeReclaimed(T0.plus(Duration.ofMinutes(9)).plusSeconds(59), TIMEOUT)).isFalse();
    assertThat(p.canBeReclaimed(T0.plus(TIMEOUT), TIMEOUT)).isTrue();
    assertThat(p.canBeReclaimed(T0.plus(TIMEOUT).plusSeconds(1), TIMEOUT)).isTrue();
  }

  @Test
  void facilitatorIsNeverReclaimedByPseudo() {
    Participant f =
        Participant.join(UUID.randomUUID(), SESSION, Pseudo.of("Bob"), Role.FACILITATOR, "h", T0);
    assertThat(f.canBeReclaimed(T0.plus(Duration.ofDays(1)), TIMEOUT)).isFalse();
  }

  @Test
  void reclaimReplacesTheTokenHashAndKeepsIdentity() {
    Participant p = alice();
    Participant again = p.reclaim("new-hash", T0.plusSeconds(3600));
    assertThat(again.id()).isEqualTo(p.id());
    assertThat(again.participantTokenHash()).isEqualTo("new-hash");
    assertThat(again.lastSeenAt()).isEqualTo(T0.plusSeconds(3600));
    assertThat(again.joinedAt()).isEqualTo(T0);
  }

  @Test
  void roleAndBusinessRoleChanges() {
    Participant p = alice();
    assertThat(p.withRole(Role.FACILITATOR).role()).isEqualTo(Role.FACILITATOR);
    assertThat(p.withBusinessRole("Tech Lead").businessRole()).isEqualTo("Tech Lead");
    assertThat(p.withTokenHash("x").participantTokenHash()).isEqualTo("x");
    assertThat(p.withVersion(3).version()).isEqualTo(3);
  }

  @Test
  void toStringHidesTheTokenHash() {
    assertThat(alice().toString()).startsWith("Participant[").doesNotContain("hash");
  }
}
