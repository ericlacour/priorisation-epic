package com.priorisationepic.application;

import com.priorisationepic.application.RankingRoomView.EndReason;
import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.method.CriterionDefinition;
import com.priorisationepic.domain.method.MethodDefinition;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.ranking.Opinion;
import com.priorisationepic.domain.ranking.RankingDraft;
import com.priorisationepic.domain.ranking.RankingRefusedException;
import com.priorisationepic.domain.ranking.RankingRoom;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import java.util.stream.Collectors;

/**
 * Salle de classement collaboratif (FR-015b, FR-015c) : une salle en mémoire par session, du
 * premier brouillon de l'animateur à sa fin. Les intentions s'exécutent sous le verrou de la
 * session, n'écrivent rien en base et ne changent pas {@code sessionState.version} : après chaque
 * intention acceptée, chaque connexion reçoit le même {@code rankingRoom}. Un refus ne change rien
 * et lève {@link IntentRejectedException}.
 */
public class RankingRoomUseCase {

  /** Le brouillon reçu de l'animateur, avant contrôle ({@code updateRankingDraft.draft}). */
  public record Draft(
      List<String> criterionKeys,
      String criterionKey,
      List<List<UUID>> levels,
      List<UUID> unranked,
      Map<UUID, Integer> values) {}

  private final SessionRepository sessions;
  private final FeatureRepository features;
  private final RoundRepository rounds;
  private final MethodRegistry methods;
  private final Broadcaster broadcaster;
  private final SessionLocks locks;
  private final Map<SessionId, RankingRoom> rooms = new ConcurrentHashMap<>();

  public RankingRoomUseCase(
      SessionRepository sessions,
      FeatureRepository features,
      RoundRepository rounds,
      MethodRegistry methods,
      Broadcaster broadcaster,
      SessionLocks locks) {
    this.sessions = sessions;
    this.features = features;
    this.rounds = rounds;
    this.methods = methods;
    this.broadcaster = broadcaster;
    this.locks = locks;
  }

  /**
   * {@code updateRankingDraft} : le premier brouillon diffusé ouvre la salle. {@code live} faux met
   * la diffusion en pause ; le brouillon est alors ignoré. Une fonctionnalité supprimée entre-temps
   * sort du brouillon diffusé.
   */
  public void updateDraft(
      SessionId sessionId, UUID participantId, boolean facilitator, boolean live, Draft draft) {
    run(
        sessionId,
        () -> {
          requireFacilitator(facilitator);
          Session session = writableSession(sessionId);
          RankingRoom room = rooms.get(sessionId);
          if (!live) {
            requireRoom(room).pause();
            publish(sessionId, room);
            return;
          }
          if (draft == null) {
            throw new IntentRejectedException(ErrorCode.INVALID_MESSAGE);
          }
          RankingDraft checked = check(session, draft);
          if (room == null) {
            room = RankingRoom.open(participantId, checked);
            rooms.put(sessionId, room);
          } else {
            room.broadcast(checked);
          }
          publish(sessionId, room);
        });
  }

  /** {@code endRanking} : {@code SAVED} ou {@code CANCELLED}. */
  public void end(SessionId sessionId, boolean facilitator, EndReason outcome) {
    run(
        sessionId,
        () -> {
          requireFacilitator(facilitator);
          writableSession(sessionId);
          requireRoom(rooms.get(sessionId));
          close(sessionId, outcome);
        });
  }

  /**
   * {@code giveOpinion} : un avis de participant, l'animateur déplace la carte. La valeur souhaitée
   * est une valeur de l'échelle de la session.
   */
  public void giveOpinion(
      SessionId sessionId,
      UUID participantId,
      boolean facilitator,
      UUID featureId,
      String criterionKey,
      Opinion opinion,
      String comment,
      Integer value) {
    run(
        sessionId,
        () -> {
          if (facilitator) {
            throw new IntentRejectedException(ErrorCode.FORBIDDEN);
          }
          Session session = writableSession(sessionId);
          RankingRoom room = requireRoom(rooms.get(sessionId));
          if (value != null && !session.scale().accepts(value)) {
            throw new IntentRejectedException(ErrorCode.INVALID_VALUE);
          }
          room.giveOpinion(participantId, featureId, criterionKey, opinion, comment, value);
          publish(sessionId, room);
        });
  }

  /** {@code clearOpinions} : « Effacer les avis » d'une carte pour un critère. */
  public void clearOpinions(
      SessionId sessionId, boolean facilitator, UUID featureId, String criterionKey) {
    run(
        sessionId,
        () -> {
          requireFacilitator(facilitator);
          writableSession(sessionId);
          RankingRoom room = requireRoom(rooms.get(sessionId));
          room.clearOpinions(featureId, criterionKey);
          publish(sessionId, room);
        });
  }

  /** {@code setSpotlight} : met une carte en discussion, {@code null} termine la discussion. */
  public void setSpotlight(SessionId sessionId, boolean facilitator, UUID featureId) {
    run(
        sessionId,
        () -> {
          requireFacilitator(facilitator);
          writableSession(sessionId);
          RankingRoom room = requireRoom(rooms.get(sessionId));
          room.spotlight(featureId);
          publish(sessionId, room);
        });
  }

  /** Une connexion vient de s'ouvrir : elle reçoit la salle en cours, s'il y en a une. */
  public void connected(SessionId sessionId, String connectionId) {
    locks.withLock(
        sessionId,
        () -> {
          RankingRoom room = rooms.get(sessionId);
          if (room != null) {
            broadcaster.sendRankingRoom(connectionId, RankingRoomView.of(room));
          }
          return null;
        });
  }

  /**
   * Une connexion s'est fermée : sans plus aucune connexion d'animateur, la salle se ferme ({@code
   * FACILITATOR_LEFT}) et les membres reviennent au tableau.
   */
  public void connectionClosed(SessionId sessionId) {
    locks.withLock(
        sessionId,
        () -> {
          if (rooms.containsKey(sessionId) && !broadcaster.hasFacilitatorConnection(sessionId)) {
            close(sessionId, EndReason.FACILITATOR_LEFT);
          }
          return null;
        });
  }

  /** La session vient d'être clôturée : la salle se ferme ({@code SESSION_CLOSED}). */
  public void sessionClosed(SessionId sessionId) {
    locks.withLock(
        sessionId,
        () -> {
          if (rooms.containsKey(sessionId)) {
            close(sessionId, EndReason.SESSION_CLOSED);
          }
          return null;
        });
  }

  private void run(SessionId sessionId, Runnable action) {
    locks.withLock(
        sessionId,
        (Supplier<Void>)
            () -> {
              try {
                action.run();
              } catch (RankingRefusedException e) {
                throw rejection(e);
              }
              return null;
            });
  }

  private RankingDraft check(Session session, Draft draft) {
    MethodDefinition method = methods.get(session.method(), session.methodVersion()).definition();
    Set<UUID> active =
        features.listActive(session.id(), method).stream()
            .map(Feature::id)
            .collect(Collectors.toSet());
    RankingDraft built =
        new RankingDraft(
                draft.criterionKeys(),
                draft.criterionKey(),
                draft.levels(),
                draft.unranked(),
                draft.values())
            .retainOnly(active);
    built.requireAllowed(
        method.criteria().stream().map(CriterionDefinition::key).toList(),
        session.scale(),
        rounds.featuresInOpenRound(session.id()));
    return built;
  }

  private void close(SessionId sessionId, EndReason reason) {
    rooms.remove(sessionId);
    broadcaster.publishRankingRoom(sessionId, RankingRoomView.ended(reason));
  }

  private void publish(SessionId sessionId, RankingRoom room) {
    broadcaster.publishRankingRoom(sessionId, RankingRoomView.of(room));
  }

  private Session writableSession(SessionId sessionId) {
    Session session = sessions.find(sessionId).orElseThrow(SessionNotFoundException::new);
    if (!session.isWritable()) {
      throw new IntentRejectedException(ErrorCode.SESSION_CLOSED);
    }
    return session;
  }

  private static void requireFacilitator(boolean facilitator) {
    if (!facilitator) {
      throw new IntentRejectedException(ErrorCode.FORBIDDEN);
    }
  }

  private static RankingRoom requireRoom(RankingRoom room) {
    if (room == null) {
      throw new IntentRejectedException(ErrorCode.NO_RANKING_IN_PROGRESS);
    }
    return room;
  }

  private static IntentRejectedException rejection(RankingRefusedException e) {
    return switch (e.reason()) {
      case UNKNOWN_CRITERION -> new IntentRejectedException(ErrorCode.UNKNOWN_CRITERION);
      case VALUE_OUT_OF_SCALE -> new IntentRejectedException(ErrorCode.INVALID_VALUE);
      case FEATURE_IN_OPEN_ROUND ->
          new IntentRejectedException(ErrorCode.FEATURE_IN_OPEN_ROUND, e.featureId());
      case NOT_IN_RANKING -> new IntentRejectedException(ErrorCode.NOT_IN_RANKING);
      case INVALID_DRAFT, DUPLICATE_FEATURE, COMMENT_TOO_LONG, VALUE_WITHOUT_MOVE ->
          new IntentRejectedException(ErrorCode.INVALID_MESSAGE);
    };
  }
}
