package com.priorisationepic.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.method.UnknownMethodException;
import com.priorisationepic.domain.scale.Scale;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class SessionTest {

  private static final SessionId ID = new SessionId("f".repeat(22));
  private static final Instant NOW = Instant.parse("2026-10-12T10:00:00Z");
  private static final MethodRegistry REGISTRY = MethodRegistry.standard();
  private static final Pseudo ALICE = Pseudo.of("Alice");

  private static Session session() {
    return Session.create(REGISTRY, ID, "Atelier", null, "hash", ALICE, NOW);
  }

  @Test
  void createDefaults() {
    Session s = session();
    assertThat(s.status()).isEqualTo(SessionStatus.PREPARATION);
    assertThat(s.method()).isEqualTo(REGISTRY.defaultMethod().definition().key());
    assertThat(s.methodVersion()).isEqualTo(REGISTRY.defaultMethod().definition().version());
    assertThat(s.scale()).isEqualTo(Scale.defaultScale());
    assertThat(s.createdAt()).isEqualTo(NOW);
    assertThat(s.createdByPseudo()).isEqualTo(ALICE);
    assertThat(s.animationTokenHash()).isEqualTo("hash");
    assertThat(s.version()).isZero();
    assertThat(s.name()).isEqualTo("Atelier");
  }

  @Test
  void explicitMethodIsKeptAtItsLatestVersion() {
    Session s = Session.create(REGISTRY, ID, "x", "WSJF", "h", ALICE, NOW);
    assertThat(s.method()).isEqualTo("WSJF");
    assertThat(s.methodVersion()).isEqualTo(1);
    assertThat(s.prioritizationMethod(REGISTRY)).isSameAs(REGISTRY.get("WSJF", 1));
  }

  @Test
  void unknownMethodIsRefused() {
    assertThatThrownBy(() -> Session.create(REGISTRY, ID, "x", "RICE", "h", ALICE, NOW))
        .isInstanceOf(UnknownMethodException.class);
  }

  @Test
  void nameIsBetween1And120Characters() {
    assertThat(Session.create(REGISTRY, ID, "n".repeat(120), null, "h", ALICE, NOW)).isNotNull();
    for (String bad : new String[] {null, "", "  ", "n".repeat(121)}) {
      assertThatThrownBy(() -> Session.create(REGISTRY, ID, bad, null, "h", ALICE, NOW))
          .isInstanceOf(InvalidSessionException.class);
    }
    assertThat(session().rename(" Neuf ").name()).isEqualTo("Neuf");
    assertThatThrownBy(() -> session().rename("")).isInstanceOf(InvalidSessionException.class);
  }

  @Test
  void statusTransitions() {
    Session s = session();
    Session started = s.start();
    assertThat(started.status()).isEqualTo(SessionStatus.IN_PROGRESS);
    Session closed = started.close();
    assertThat(closed.status()).isEqualTo(SessionStatus.CLOSED);
    assertThat(closed.isClosed()).isTrue();
    assertThat(started.isClosed()).isFalse();
    assertThat(closed.reopen().status()).isEqualTo(SessionStatus.IN_PROGRESS);
  }

  @Test
  void forbiddenTransitions() {
    Session s = session();
    Session started = s.start();
    Session closed = started.close();
    assertThatThrownBy(s::close).isInstanceOf(InvalidTransitionException.class);
    assertThatThrownBy(s::reopen).isInstanceOf(InvalidTransitionException.class);
    assertThatThrownBy(started::start).isInstanceOf(InvalidTransitionException.class);
    assertThatThrownBy(started::reopen).isInstanceOf(InvalidTransitionException.class);
    assertThatThrownBy(closed::start).isInstanceOf(InvalidTransitionException.class);
    assertThatThrownBy(closed::close).isInstanceOf(InvalidTransitionException.class);
  }

  @Test
  void scaleAndTokenAndVersionChanges() {
    Session s = session();
    assertThat(s.withScale(Scale.continuous(20)).scale().max()).isEqualTo(20);
    assertThat(s.withAnimationTokenHash("n").animationTokenHash()).isEqualTo("n");
    assertThat(s.withVersion(4).version()).isEqualTo(4);
    assertThatThrownBy(() -> s.withScale(null)).isInstanceOf(NullPointerException.class);
  }

  @Test
  void toStringHidesTheTokenHash() {
    assertThat(session().toString()).startsWith("Session[").doesNotContain("hash");
  }
}
