package com.priorisationepic.application;

import com.priorisationepic.application.SessionState.ExactValue;
import com.priorisationepic.application.SessionState.FeatureView;
import com.priorisationepic.application.SessionState.Me;
import com.priorisationepic.application.SessionState.ParticipantView;
import com.priorisationepic.application.SessionState.ScaleView;
import com.priorisationepic.application.SessionState.ScoreView;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.method.MethodDefinition;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.method.PrioritizationMethod;
import com.priorisationepic.domain.method.RankedFeature;
import com.priorisationepic.domain.method.Ranking;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Construit le {@code sessionState} d'une session pour un destinataire. Les scores et les rangs
 * viennent du domaine seul ({@link Ranking}) : ils ne sont ni saisis ni stockés (FR-016). Le rang
 * n'existe que pour les fonctionnalités complètes. Le destinataire sert à remplir {@code me} (nul
 * pour la consultation REST) ; le masquage des valeurs pendant un tour ouvert viendra avec les
 * tours (US2).
 */
public class SessionStateAssembler implements SessionStateProvider {

  /** Présence : au moins une connexion rattachée du participant (FR-005). */
  @FunctionalInterface
  public interface Presence {
    boolean isOnline(SessionId sessionId, UUID participantId);
  }

  private final SessionRepository sessions;
  private final ParticipantRepository participants;
  private final FeatureRepository features;
  private final MethodRegistry registry;
  private final Presence presence;

  public SessionStateAssembler(
      SessionRepository sessions,
      ParticipantRepository participants,
      FeatureRepository features,
      MethodRegistry registry,
      Presence presence) {
    this.sessions = sessions;
    this.participants = participants;
    this.features = features;
    this.registry = registry;
    this.presence = presence;
  }

  @Override
  public Optional<Object> stateFor(SessionId sessionId, UUID participantId, boolean facilitator) {
    return assemble(sessionId, participantId).map(state -> (Object) state);
  }

  /**
   * L'état de la session sans destinataire ({@code me} nul), pour {@code GET /api/sessions/{id}}.
   */
  public Optional<SessionState> consultation(SessionId sessionId) {
    return assemble(sessionId, null);
  }

  private Optional<SessionState> assemble(SessionId sessionId, UUID recipient) {
    Optional<Session> found = sessions.find(sessionId);
    if (found.isEmpty()) {
      return Optional.empty();
    }
    Session session = found.get();
    List<Participant> everyone = participants.findAll(sessionId);
    Me me = null;
    if (recipient != null) {
      Optional<Participant> self =
          everyone.stream().filter(p -> p.id().equals(recipient)).findFirst();
      if (self.isEmpty()) {
        return Optional.empty();
      }
      me = new Me(recipient, self.get().pseudo().value(), self.get().role().name());
    }
    PrioritizationMethod method = session.prioritizationMethod(registry);
    MethodDefinition definition = method.definition();
    List<RankedFeature> ranked =
        Ranking.rank(method, session.scale(), features.findActive(sessionId, definition));
    return Optional.of(
        new SessionState(
            "sessionState",
            session.version(),
            sessionId.value(),
            session.name(),
            session.status().name(),
            definition.key(),
            definition.version(),
            definition,
            definition.formula(),
            definition.tieBreakRule(),
            new ScaleView(
                session.scale().type().name(),
                session.scale().max(),
                session.scale().allowedValues()),
            me,
            everyone.stream().map(p -> participantView(sessionId, p)).toList(),
            ranked.stream().map(SessionStateAssembler::featureView).toList()));
  }

  private ParticipantView participantView(SessionId sessionId, Participant p) {
    return new ParticipantView(
        p.id(),
        p.pseudo().value(),
        p.role().name(),
        p.businessRole(),
        presence.isOnline(sessionId, p.id()));
  }

  private static FeatureView featureView(RankedFeature item) {
    var feature = item.feature();
    var score = item.score();
    Map<String, ExactValue> computed = null;
    if (score.complete()) {
      computed = new LinkedHashMap<>();
      for (var entry : score.computed().entrySet()) {
        var exact = entry.getValue().exact();
        computed.put(
            entry.getKey(),
            new ExactValue(exact.numerator(), exact.denominator(), entry.getValue().display()));
      }
    }
    return new FeatureView(
        feature.id(),
        feature.externalId(),
        feature.title(),
        feature.description().isEmpty() ? null : feature.description(),
        feature.version(),
        feature.markedForReview(),
        feature.reviewReason(),
        feature.criteria().values(),
        new ScoreView(
            score.complete(),
            score.outOfScale(),
            computed,
            score.explanation().orElse(null),
            score.complete() ? score.rank() : null));
  }
}
