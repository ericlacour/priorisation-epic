package com.priorisationepic.adapter.in.ws;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.priorisationepic.application.ErrorCode;
import com.priorisationepic.application.RankingRoomView;
import com.priorisationepic.domain.ranking.CardOpinion;
import com.priorisationepic.domain.ranking.RankingDraft;
import com.priorisationepic.domain.scale.Scale;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Messages serveur → client du canal de session (asyncapi.yaml), d'après {@code tick.json}, {@code
 * error.json} et {@code ranking-room.json}.
 */
final class ServerMessages {

  private ServerMessages() {}

  /** {@code tick.json} */
  record TickMessage(String type) {
    static final TickMessage INSTANCE = new TickMessage("tick");
  }

  /** {@code error.json} */
  @JsonInclude(JsonInclude.Include.NON_NULL)
  record ErrorMessage(
      String type, String code, UUID featureId, List<ImpactedValue> impactedValues) {

    static ErrorMessage of(ErrorCode code) {
      return of(code, null);
    }

    static ErrorMessage of(ErrorCode code, UUID featureId) {
      return new ErrorMessage("error", code.name(), featureId, null);
    }

    /** {@code SCALE_IMPACT} et ses valeurs impactées. */
    static ErrorMessage scaleImpact(List<Scale.Impact> impacts) {
      return new ErrorMessage(
          "error",
          ErrorCode.SCALE_IMPACT.name(),
          null,
          impacts.stream()
              .map(i -> new ImpactedValue(i.externalId(), i.criterionKey(), i.value()))
              .toList());
    }
  }

  /** Une valeur que le changement d'échelle mettrait hors échelle. */
  record ImpactedValue(String externalId, String criterion, int value) {}

  /**
   * {@code ranking-room.json} : une salle ouverte porte tous ses champs ({@code spotlightFeatureId}
   * compris, même nul) ; une salle fermée ne porte que {@code endReason}.
   */
  static Object rankingRoom(RankingRoomView room) {
    if (!room.active()) {
      return new EndedRankingRoom("rankingRoom", false, room.endReason().name());
    }
    RankingDraft draft = room.draft();
    return new ActiveRankingRoom(
        "rankingRoom",
        true,
        room.facilitatorId(),
        room.live(),
        new Draft(
            draft.criterionKeys(),
            draft.criterionKey(),
            draft.levels(),
            draft.unranked(),
            draft.values()),
        room.opinions().stream().map(ServerMessages::opinion).toList(),
        room.spotlightFeatureId(),
        room.discussed().stream()
            .map(card -> new Discussed(card.featureId(), card.criterionKey()))
            .toList(),
        room.agreed().stream()
            .map(card -> new Discussed(card.featureId(), card.criterionKey()))
            .toList());
  }

  private static Opinion opinion(CardOpinion opinion) {
    return new Opinion(
        opinion.featureId(),
        opinion.criterionKey(),
        opinion.participantId(),
        opinion.opinion().name(),
        opinion.comment(),
        opinion.value());
  }

  record EndedRankingRoom(String type, boolean active, String endReason) {}

  record ActiveRankingRoom(
      String type,
      boolean active,
      UUID facilitatorId,
      boolean live,
      Draft draft,
      List<Opinion> opinions,
      UUID spotlightFeatureId,
      List<Discussed> discussed,
      List<Discussed> agreed) {}

  record Discussed(UUID featureId, String criterionKey) {}

  record Draft(
      List<String> criterionKeys,
      String criterionKey,
      List<List<UUID>> levels,
      List<UUID> unranked,
      Map<UUID, Integer> values) {}

  /** Un avis : {@code comment} et {@code value} sont absents quand il n'y en a pas. */
  @JsonInclude(JsonInclude.Include.NON_NULL)
  record Opinion(
      UUID featureId,
      String criterionKey,
      UUID participantId,
      String opinion,
      String comment,
      Integer value) {}
}
