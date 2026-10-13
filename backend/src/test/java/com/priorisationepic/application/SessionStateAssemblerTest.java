package com.priorisationepic.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.application.SessionStateView.FeatureView;
import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.method.Criteria;
import com.priorisationepic.domain.method.MethodRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class SessionStateAssemblerTest {

  private final MutableClock clock = new MutableClock(Instant.parse("2026-10-12T08:00:00Z"));
  private final InMemoryStore store = new InMemoryStore();
  private final RecordingBroadcaster broadcaster = new RecordingBroadcaster();
  private final MethodRegistry methods = MethodRegistry.standard();
  private final SessionStateAssembler assembler =
      new SessionStateAssembler(store, store, store, methods, broadcaster);

  private SessionId session;
  private UUID alice;
  private UUID bob;

  @BeforeEach
  void setUp() {
    IdGenerator ids = new IdGenerator(new Random(3));
    session =
        new CreateSessionUseCase(store, store, methods, ids, clock::instant, store)
            .create(new CreateSessionUseCase.Command("Atelier", "Alice", null, null))
            .sessionId();
    new JoinSessionUseCase(
            store,
            store,
            broadcaster,
            new SessionLocks(),
            ids,
            clock::instant,
            store,
            Duration.ofMinutes(10))
        .join(session.value(), "Bob", null);
    alice = store.list(session).getFirst().id();
    bob = store.list(session).get(1).id();
  }

  private void feature(String externalId, Map<String, Integer> values) {
    store.insert(
        Feature.create(
            UUID.randomUUID(),
            session,
            externalId,
            "Titre " + externalId,
            null,
            Criteria.of(methods.defaultMethod().definition(), values)));
  }

  @Test
  void theStateCarriesTheMethodDefinitionTheScaleAndTheFormula() {
    SessionStateView state =
        (SessionStateView) assembler.stateFor(session, alice, true).orElseThrow();

    assertThat(state.type()).isEqualTo("sessionState");
    assertThat(state.method()).isEqualTo("WSJF");
    assertThat(state.methodVersion()).isEqualTo(1);
    assertThat(state.methodDefinition()).isEqualTo(methods.defaultMethod().definition());
    assertThat(state.formula()).isEqualTo("CoD = BV + TC + RR/OE ; WSJF = CoD / JS");
    assertThat(state.tieBreakRule()).isEqualTo(methods.defaultMethod().definition().tieBreakRule());
    assertThat(state.scale().max()).isEqualTo(10);
    assertThat(state.scale().allowedValues()).hasSize(10);
    assertThat(state.status()).isEqualTo("PREPARATION");
    assertThat(state.sessionId()).isEqualTo(session.value());
  }

  @Test
  void meIsTheRecipientAndAbsentInTheReadOnlyView() {
    SessionStateView forBob =
        (SessionStateView) assembler.stateFor(session, bob, false).orElseThrow();
    SessionStateView readOnly = assembler.readOnlyView(session).orElseThrow();

    assertThat(forBob.me().pseudo()).isEqualTo("Bob");
    assertThat(forBob.me().role()).isEqualTo("PARTICIPANT");
    assertThat(readOnly.me()).isNull();
  }

  @Test
  void meIsFacilitatorOnlyWhenTheConnectionHoldsTheAnimationRights() {
    SessionStateView withRights =
        (SessionStateView) assembler.stateFor(session, alice, true).orElseThrow();
    SessionStateView withoutRights =
        (SessionStateView) assembler.stateFor(session, alice, false).orElseThrow();
    // Bob prend la main avec le lien d'animation : ses droits viennent de la connexion.
    SessionStateView bobWithRights =
        (SessionStateView) assembler.stateFor(session, bob, true).orElseThrow();

    assertThat(withRights.me().role()).isEqualTo("FACILITATOR");
    assertThat(withoutRights.me().role()).isEqualTo("PARTICIPANT");
    assertThat(bobWithRights.me().role()).isEqualTo("FACILITATOR");
    assertThat(withoutRights.participants().getFirst().role()).isEqualTo("FACILITATOR");
  }

  @Test
  void participantsAreListedWithTheirPresence() {
    broadcaster.attach("c1", session, bob, false);

    SessionStateView state =
        (SessionStateView) assembler.stateFor(session, alice, true).orElseThrow();

    assertThat(state.participants())
        .extracting(SessionStateView.ParticipantView::pseudo)
        .containsExactly("Alice", "Bob");
    assertThat(state.participants())
        .extracting(SessionStateView.ParticipantView::online)
        .containsExactly(false, true);
    assertThat(state.participants().getFirst().role()).isEqualTo("FACILITATOR");
  }

  @Test
  void featuresAreSortedAndRankedAndEachCarriesItsScore() {
    feature("F-2", Map.of("bv", 2, "tc", 2, "rrOe", 2, "js", 3));
    feature("F-1", Map.of("bv", 8, "tc", 5, "rrOe", 3, "js", 4));
    feature("F-3", Map.of("bv", 5));
    feature("F-4", Map.of("bv", 20, "tc", 1, "rrOe", 1, "js", 1));

    SessionStateView state = assembler.readOnlyView(session).orElseThrow();

    assertThat(state.features())
        .extracting(FeatureView::externalId)
        .containsExactly("F-1", "F-2", "F-3", "F-4");
    assertThat(state.features()).extracting(f -> f.score().rank()).containsExactly(1, 2, 3, 4);
    FeatureView f1 = state.features().getFirst();
    assertThat(f1.score().complete()).isTrue();
    assertThat(f1.score().computed().get("cod").display()).isEqualTo("16");
    assertThat(f1.score().computed().get("wsjf").display()).isEqualTo("4,00");
    assertThat(f1.score().computed().get("wsjf").numerator()).isEqualTo(4);
    assertThat(f1.score().computed().get("wsjf").denominator()).isEqualTo(1);
    assertThat(f1.score().explanation()).isEqualTo("CoD = 8 + 5 + 3 = 16 ; WSJF = 16 / 4 = 4,00");
    FeatureView incomplete = state.features().get(2);
    assertThat(incomplete.score().complete()).isFalse();
    assertThat(incomplete.score().computed()).isNull();
    assertThat(incomplete.score().explanation()).isNull();
    FeatureView outOfScale = state.features().get(3);
    assertThat(outOfScale.score().outOfScale()).containsExactly("bv");
    assertThat(f1.votingInProgress()).isFalse();
    assertThat(f1.criteria()).isEqualTo(Map.of("bv", 8, "tc", 5, "rrOe", 3, "js", 4));
  }

  @Test
  void aRecipientWhoLeftTheSessionHasNoState() {
    assertThat(assembler.stateFor(session, UUID.randomUUID(), false)).isEmpty();
    assertThat(assembler.stateFor(new SessionId("A".repeat(22)), alice, true)).isEmpty();
    assertThat(assembler.readOnlyView(new SessionId("A".repeat(22)))).isEmpty();
  }

  @Test
  void aParticipantOfAnotherSessionHasNoState() {
    SessionId other =
        new CreateSessionUseCase(
                store, store, methods, new IdGenerator(new Random(99)), clock::instant, store)
            .create(new CreateSessionUseCase.Command("Autre", "Zoé", null, null))
            .sessionId();
    Participant zoe = store.list(other).getFirst();

    assertThat(assembler.stateFor(session, zoe.id(), true)).isEmpty();
  }

  @Test
  void statesForSeveralRecipientsMatchTheStateOfEachAndSkipThoseOutsideTheSession() {
    feature("F-1", Map.of("bv", 8, "tc", 5, "rrOe", 3, "js", 4));
    SessionStateProvider.Recipient aliceAnimating = new SessionStateProvider.Recipient(alice, true);
    SessionStateProvider.Recipient aliceViewing = new SessionStateProvider.Recipient(alice, false);
    SessionStateProvider.Recipient bobViewing = new SessionStateProvider.Recipient(bob, false);
    SessionStateProvider.Recipient stranger =
        new SessionStateProvider.Recipient(UUID.randomUUID(), false);

    Map<SessionStateProvider.Recipient, Object> states =
        assembler.statesFor(
            session, java.util.Set.of(aliceAnimating, aliceViewing, bobViewing, stranger));

    assertThat(states).doesNotContainKey(stranger);
    assertThat(states.get(aliceAnimating))
        .isEqualTo(assembler.stateFor(session, alice, true).orElseThrow());
    assertThat(states.get(aliceViewing))
        .isEqualTo(assembler.stateFor(session, alice, false).orElseThrow());
    assertThat(states.get(bobViewing))
        .isEqualTo(assembler.stateFor(session, bob, false).orElseThrow());
    assertThat(assembler.statesFor(new SessionId("A".repeat(22)), java.util.Set.of(bobViewing)))
        .isEmpty();
  }
}
