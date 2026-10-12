package com.priorisationepic.application;

import com.priorisationepic.application.SessionState.ExactValue;
import com.priorisationepic.application.SessionState.FeatureResultView;
import com.priorisationepic.application.SessionState.FeatureView;
import com.priorisationepic.application.SessionState.Me;
import com.priorisationepic.application.SessionState.ParticipantView;
import com.priorisationepic.application.SessionState.ProgressView;
import com.priorisationepic.application.SessionState.RoundView;
import com.priorisationepic.application.SessionState.ScaleView;
import com.priorisationepic.application.SessionState.ScoreView;
import com.priorisationepic.application.SessionState.VoteView;
import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.method.MethodDefinition;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.method.PrioritizationMethod;
import com.priorisationepic.domain.method.RankedFeature;
import com.priorisationepic.domain.method.Ranking;
import com.priorisationepic.domain.round.RoundResults;
import com.priorisationepic.domain.round.Visibility;
import com.priorisationepic.domain.round.Vote;
import com.priorisationepic.domain.round.VotingRound;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Construit le {@code sessionState} d'une session pour un destinataire. Les scores et les rangs
 * viennent du domaine seul ({@link Ranking}) : ils ne sont ni saisis ni stockés (FR-016). Le rang
 * n'existe que pour les fonctionnalités complètes. Le masquage du vote vient de {@link Visibility}
 * (FR-019, FR-019a, SC-004) : un non-animateur ne reçoit, pour une fonctionnalité en cours de vote,
 * ni valeurs ni score, et le rang des autres est calculé sans elle pour ne rien laisser deviner ;
 * chacun ne reçoit que ses propres votes tant que le tour est ouvert, jamais les résultats.
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
  private final RoundRepository rounds;
  private final MethodRegistry registry;
  private final Presence presence;

  public SessionStateAssembler(
      SessionRepository sessions,
      ParticipantRepository participants,
      FeatureRepository features,
      RoundRepository rounds,
      MethodRegistry registry,
      Presence presence) {
    this.sessions = sessions;
    this.participants = participants;
    this.features = features;
    this.rounds = rounds;
    this.registry = registry;
    this.presence = presence;
  }

  @Override
  public Optional<Object> stateFor(SessionId sessionId, UUID participantId, boolean facilitator) {
    return assemble(sessionId, participantId, facilitator).map(state -> (Object) state);
  }

  /**
   * L'état de la session sans destinataire ({@code me} nul), pour {@code GET /api/sessions/{id}}.
   */
  public Optional<SessionState> consultation(SessionId sessionId) {
    return assemble(sessionId, null, false);
  }

  private Optional<SessionState> assemble(
      SessionId sessionId, UUID recipient, boolean facilitator) {
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
    List<VotingRound> allRounds = rounds.findAll(sessionId);
    Set<UUID> inOpenRounds =
        allRounds.stream()
            .filter(VotingRound::isOpen)
            .flatMap(r -> r.featureIds().stream())
            .collect(Collectors.toSet());
    Visibility visibility = new Visibility(facilitator, recipient, inOpenRounds);
    List<Feature> active = features.findActive(sessionId, definition);
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
            featureViews(method, session, active, visibility),
            roundViews(definition, allRounds, active, everyone, recipient, visibility, true),
            roundViews(definition, allRounds, active, everyone, recipient, visibility, false)));
  }

  /**
   * Les fonctionnalités dans l'ordre du tableau. Celles que le destinataire ne doit pas voir sont à
   * la fin, sans valeurs ni score, et n'entrent pas dans le calcul des rangs.
   */
  private List<FeatureView> featureViews(
      PrioritizationMethod method, Session session, List<Feature> active, Visibility visibility) {
    List<Feature> visible = active.stream().filter(f -> !visibility.masks(f.id())).toList();
    List<RankedFeature> ranked = Ranking.rank(method, session.scale(), visible);
    List<FeatureView> views = new ArrayList<>();
    for (RankedFeature item : ranked) {
      views.add(featureView(item, visibility.votingInProgress(item.feature().id())));
    }
    active.stream()
        .filter(f -> visibility.masks(f.id()))
        .sorted(
            Comparator.comparing(Feature::externalKey)
                .thenComparing(Feature::externalId)
                .thenComparing(Feature::id))
        .forEach(f -> views.add(maskedView(f)));
    return views;
  }

  private ParticipantView participantView(SessionId sessionId, Participant p) {
    return new ParticipantView(
        p.id(),
        p.pseudo().value(),
        p.role().name(),
        p.businessRole(),
        presence.isOnline(sessionId, p.id()));
  }

  private List<RoundView> roundViews(
      MethodDefinition definition,
      List<VotingRound> allRounds,
      List<Feature> active,
      List<Participant> everyone,
      UUID recipient,
      Visibility visibility,
      boolean open) {
    List<Vote> allVotes = new ArrayList<>();
    if (!allRounds.isEmpty()) {
      allVotes.addAll(rounds.findVotes(allRounds.getFirst().sessionId()));
    }
    Set<UUID> activeIds = active.stream().map(Feature::id).collect(Collectors.toSet());
    List<VotingRound> wanted = allRounds.stream().filter(r -> r.isOpen() == open).toList();
    if (!open) {
      wanted = wanted.reversed();
    }
    List<RoundView> views = new ArrayList<>();
    for (VotingRound round : wanted) {
      List<Vote> votes = allVotes.stream().filter(v -> v.roundId().equals(round.id())).toList();
      List<ProgressView> progress =
          everyone.stream()
              .map(p -> new ProgressView(p.id(), RoundResults.completedCount(p.id(), votes)))
              .toList();
      Map<UUID, Map<String, Integer>> mine = new LinkedHashMap<>();
      List<FeatureResultView> results = null;
      if (round.isOpen()) {
        for (Vote vote : votes) {
          if (visibility.sees(vote, round) && vote.scored()) {
            mine.put(vote.featureId(), vote.values());
          }
        }
      } else {
        List<UUID> registered =
            everyone.stream()
                .filter(p -> !p.joinedAt().isAfter(round.revealedAt()))
                .map(Participant::id)
                .toList();
        results = new ArrayList<>();
        for (UUID featureId : round.featureIds()) {
          if (!activeIds.contains(featureId) || !visibility.seesRevealedVotesOf(featureId)) {
            continue;
          }
          List<Vote> ofFeature =
              votes.stream().filter(v -> v.featureId().equals(featureId)).toList();
          results.add(resultView(RoundResults.of(definition, featureId, ofFeature, registered)));
        }
      }
      views.add(
          new RoundView(
              round.id(),
              round.number(),
              round.status().name(),
              round.previousRoundId(),
              round.featureIds(),
              progress,
              mine,
              results));
    }
    return views;
  }

  private static FeatureResultView resultView(RoundResults.FeatureResult result) {
    return new FeatureResultView(
        result.featureId(),
        result.votes().stream().map(v -> new VoteView(v.participantId(), v.values())).toList(),
        result.nonVoters(),
        result.min(),
        result.max(),
        result.largeSpread(),
        result.unanimous());
  }

  private static FeatureView maskedView(Feature feature) {
    return new FeatureView(
        feature.id(),
        feature.externalId(),
        feature.title(),
        feature.description().isEmpty() ? null : feature.description(),
        feature.version(),
        feature.markedForReview(),
        feature.reviewReason(),
        true,
        null,
        null);
  }

  private static FeatureView featureView(RankedFeature item, boolean votingInProgress) {
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
        votingInProgress,
        feature.criteria().values(),
        new ScoreView(
            score.complete(),
            score.outOfScale(),
            computed,
            score.explanation().orElse(null),
            score.complete() ? score.rank() : null));
  }
}
