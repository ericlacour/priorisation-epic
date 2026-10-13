package com.priorisationepic.application;

import com.priorisationepic.application.SessionStateView.ExactValueView;
import com.priorisationepic.application.SessionStateView.FeatureView;
import com.priorisationepic.application.SessionStateView.MeView;
import com.priorisationepic.application.SessionStateView.ParticipantView;
import com.priorisationepic.application.SessionStateView.ScaleView;
import com.priorisationepic.application.SessionStateView.ScoreView;
import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.Role;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.method.ComputedValueDefinition;
import com.priorisationepic.domain.method.Fraction;
import com.priorisationepic.domain.method.MethodDefinition;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.method.PrioritizationMethod;
import com.priorisationepic.domain.method.Ranking;
import com.priorisationepic.domain.method.Score;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Construit le {@code sessionState} d'un destinataire : la définition de la méthode de la session,
 * l'échelle, les participants avec leur présence, et les fonctionnalités triées par {@link
 * Ranking}. {@code me.role} est {@code FACILITATOR} quand la connexion du destinataire détient les
 * droits d'animateur (jeton d'animation valide), sinon {@code PARTICIPANT}. Le filtrage des tours
 * de vote est ajouté avec le parcours de vote.
 */
public class SessionStateAssembler implements SessionStateProvider {

  private final SessionRepository sessions;
  private final ParticipantRepository participants;
  private final FeatureRepository features;
  private final MethodRegistry methods;
  private final Broadcaster presence;

  public SessionStateAssembler(
      SessionRepository sessions,
      ParticipantRepository participants,
      FeatureRepository features,
      MethodRegistry methods,
      Broadcaster presence) {
    this.sessions = sessions;
    this.participants = participants;
    this.features = features;
    this.methods = methods;
    this.presence = presence;
  }

  @Override
  public Optional<Object> stateFor(SessionId sessionId, UUID participantId, boolean facilitator) {
    Optional<Participant> me = participants.findById(participantId);
    if (me.isEmpty() || !me.get().sessionId().equals(sessionId)) {
      return Optional.empty();
    }
    return build(sessionId, me.get(), facilitator).map(state -> state);
  }

  /**
   * Vue de consultation sans jeton : celle d'un participant ordinaire qui n'a rien voté ({@code me}
   * est absent).
   */
  public Optional<SessionStateView> readOnlyView(SessionId sessionId) {
    return build(sessionId, null, false);
  }

  private Optional<SessionStateView> build(
      SessionId sessionId, Participant me, boolean facilitator) {
    Optional<Session> found = sessions.find(sessionId);
    if (found.isEmpty()) {
      return Optional.empty();
    }
    Session session = found.get();
    PrioritizationMethod method = methods.get(session.method(), session.methodVersion());
    MethodDefinition definition = method.definition();

    List<Feature> active = features.listActive(sessionId, definition);
    Map<UUID, Score> scores = new LinkedHashMap<>();
    for (Feature feature : active) {
      scores.put(feature.id(), Score.of(method, feature.criteria(), session.scale()));
    }
    List<FeatureView> featureViews =
        Ranking.rank(method, active, Feature::externalId, f -> scores.get(f.id())).stream()
            .map(
                ranked ->
                    featureView(
                        ranked.item(), scores.get(ranked.item().id()), ranked.rank(), definition))
            .toList();

    List<ParticipantView> participantViews =
        participants.list(sessionId).stream()
            .map(
                p ->
                    new ParticipantView(
                        p.id(),
                        p.pseudo().value(),
                        p.role().name(),
                        p.businessRole(),
                        presence.hasConnection(sessionId, p.id())))
            .toList();

    return Optional.of(
        new SessionStateView(
            SessionStateView.TYPE,
            session.version(),
            sessionId.value(),
            session.name(),
            session.status().name(),
            session.method(),
            session.methodVersion(),
            definition,
            definition.formula(),
            definition.tieBreakRule(),
            new ScaleView(
                session.scale().type().name(),
                session.scale().max(),
                session.scale().allowedValues()),
            me == null
                ? null
                : new MeView(
                    me.id(),
                    me.pseudo().value(),
                    // Les droits sont ceux de la connexion (jeton d'animation), pas le rôle en
                    // base.
                    (facilitator ? Role.FACILITATOR : Role.PARTICIPANT).name()),
            participantViews,
            featureViews));
  }

  private static FeatureView featureView(
      Feature feature, Score score, int rank, MethodDefinition definition) {
    Map<String, ExactValueView> computed = null;
    if (score.complete()) {
      computed = new LinkedHashMap<>();
      for (ComputedValueDefinition value : definition.computedValues()) {
        Fraction fraction = score.computed().get(value.key());
        computed.put(
            value.key(),
            new ExactValueView(
                fraction.numerator(), fraction.denominator(), fraction.display(value.display())));
      }
    }
    return new FeatureView(
        feature.id(),
        feature.externalId(),
        feature.title(),
        feature.description(),
        feature.version(),
        feature.markedForReview(),
        feature.reviewReason(),
        false,
        feature.criteria().asMap(),
        new ScoreView(score.complete(), score.outOfScale(), computed, score.explanation(), rank));
  }
}
