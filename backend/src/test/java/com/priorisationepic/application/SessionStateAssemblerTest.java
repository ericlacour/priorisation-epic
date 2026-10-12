package com.priorisationepic.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.ContractSchemas;
import com.priorisationepic.application.SessionState.FeatureView;
import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.Role;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.Tokens;
import com.priorisationepic.domain.method.Criteria;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.method.WsjfMethod;
import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.testmethod.FakeTwoCriteriaMethod;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class SessionStateAssemblerTest {

  private static final SessionId SESSION = new SessionId("k3Jx9QvT2mLpZ8wR4nYb7A");
  private static final Instant NOW = Instant.parse("2026-10-12T08:00:00Z");
  private static final JsonMapper JSON = JsonMapper.builder().build();

  private final InMemorySessionRepository sessions = new InMemorySessionRepository();
  private final InMemoryParticipantRepository participants = new InMemoryParticipantRepository();
  private final InMemoryFeatureRepository features = new InMemoryFeatureRepository();
  private final Set<UUID> online = new HashSet<>();
  private final UUID eric = UUID.randomUUID();
  private final UUID alice = UUID.randomUUID();

  private SessionStateAssembler assembler(MethodRegistry registry) {
    return new SessionStateAssembler(
        sessions, participants, features, registry, (s, p) -> online.contains(p));
  }

  private void seed(MethodRegistry registry, String methodKey) {
    sessions.insert(
        Session.create(
                registry, SESSION, "Atelier", methodKey, Tokens.hash("a"), Pseudo.of("eric"), NOW)
            .start());
    participants.insert(
        Participant.join(
            eric, SESSION, Pseudo.of("eric"), Role.FACILITATOR, Tokens.hash("e"), NOW));
    participants.insert(
        Participant.join(
                alice, SESSION, Pseudo.of("alice"), Role.PARTICIPANT, Tokens.hash("p"), NOW)
            .withBusinessRole("Tech Lead"));
  }

  private void feature(
      MethodRegistry registry, String externalId, String methodKey, Map<String, Integer> values) {
    Session session = sessions.find(SESSION).orElseThrow();
    Criteria none = Criteria.empty(session.prioritizationMethod(registry).definition());
    Feature f =
        Feature.create(
                UUID.randomUUID(),
                SESSION,
                externalId,
                "Titre " + externalId,
                "",
                none,
                Scale.defaultScale())
            .withCriteriaChanges(values, Scale.defaultScale());
    features.insert(f);
  }

  private String json(Object state) {
    return JSON.writeValueAsString(state);
  }

  @Test
  void wsjfStateIsRankedFilteredAndMatchesTheContract() {
    MethodRegistry registry = MethodRegistry.standard();
    seed(registry, null);
    feature(registry, "F-1", null, Map.of("bv", 8, "tc", 5, "rrOe", 3, "js", 4));
    feature(registry, "F-2", null, Map.of("bv", 3, "tc", 2, "rrOe", 1, "js", 6));
    feature(registry, "F-3", null, Map.of("bv", 6));
    online.add(eric);

    SessionState state =
        (SessionState) assembler(registry).stateFor(SESSION, eric, true).orElseThrow();

    assertThat(state.me().role()).isEqualTo("FACILITATOR");
    assertThat(state.version()).isZero();
    assertThat(state.participants())
        .extracting(p -> p.pseudo() + ":" + p.online() + ":" + p.businessRole())
        .containsExactly("eric:true:null", "alice:false:Tech Lead");
    assertThat(state.features())
        .extracting(FeatureView::externalId)
        .containsExactly("F-1", "F-2", "F-3");
    assertThat(state.features().get(0).score().rank()).isEqualTo(1);
    assertThat(state.features().get(0).score().computed().get("wsjf").display()).isEqualTo("4,00");
    assertThat(state.features().get(1).score().rank()).isEqualTo(2);
    FeatureView incomplete = state.features().get(2);
    assertThat(incomplete.score().complete()).isFalse();
    assertThat(incomplete.score().rank()).isNull();
    assertThat(incomplete.score().computed()).isNull();
    assertThat(incomplete.score().explanation()).isNull();
    assertThat(incomplete.description()).isNull();
    assertThat(ContractSchemas.violations("session-state.json", json(state))).isEmpty();
  }

  @Test
  void consultationHasNoRecipient() {
    MethodRegistry registry = MethodRegistry.standard();
    seed(registry, null);
    SessionState state = assembler(registry).consultation(SESSION).orElseThrow();
    assertThat(state.me()).isNull();
    assertThat(ContractSchemas.violations("session-state.json", json(state))).isEmpty();
  }

  @Test
  void anotherMethodNeedsNoChangeToTheAssembler() {
    MethodRegistry registry =
        new MethodRegistry(List.of(new WsjfMethod(), new FakeTwoCriteriaMethod()), "WSJF");
    seed(registry, FakeTwoCriteriaMethod.KEY);
    String first = registry.latest(FakeTwoCriteriaMethod.KEY).definition().criteria().get(0).key();
    String second = registry.latest(FakeTwoCriteriaMethod.KEY).definition().criteria().get(1).key();
    feature(registry, "F-1", FakeTwoCriteriaMethod.KEY, Map.of(first, 6, second, 3));

    SessionState state =
        assembler(registry)
            .stateFor(SESSION, alice, false)
            .map(SessionState.class::cast)
            .orElseThrow();

    assertThat(state.method()).isEqualTo(FakeTwoCriteriaMethod.KEY);
    assertThat(state.features().get(0).criteria()).containsOnlyKeys(first, second);
    assertThat(state.features().get(0).score().computed()).isNotEmpty();
    assertThat(ContractSchemas.violations("session-state.json", json(state))).isEmpty();
  }

  @Test
  void unknownSessionOrParticipantGivesNothing() {
    MethodRegistry registry = MethodRegistry.standard();
    assertThat(assembler(registry).stateFor(SESSION, eric, true)).isEmpty();
    seed(registry, null);
    assertThat(assembler(registry).stateFor(SESSION, UUID.randomUUID(), false)).isEmpty();
    assertThat(assembler(registry).consultation(new SessionId("z".repeat(22)))).isEmpty();
  }

  @Test
  void valuesOutsideTheScaleAreReportedAndNotRanked() {
    MethodRegistry registry = MethodRegistry.standard();
    seed(registry, null);
    feature(registry, "F-1", null, Map.of("bv", 8, "tc", 5, "rrOe", 3, "js", 4));
    sessions.put(sessions.find(SESSION).orElseThrow().withScale(Scale.continuous(5)));
    SessionState state = assembler(registry).consultation(SESSION).orElseThrow();
    FeatureView view = state.features().get(0);
    assertThat(view.score().complete()).isFalse();
    assertThat(view.score().outOfScale()).containsExactly("bv");
    assertThat(view.score().rank()).isNull();
  }
}
