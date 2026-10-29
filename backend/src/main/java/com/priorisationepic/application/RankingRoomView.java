package com.priorisationepic.application;

import com.priorisationepic.domain.ranking.CardOpinion;
import com.priorisationepic.domain.ranking.RankingDraft;
import com.priorisationepic.domain.ranking.RankingRoom;
import java.util.List;
import java.util.UUID;

/**
 * Le {@code rankingRoom} envoyé à chaque membre (contract/schemas/ranking-room.json), le même pour
 * tous. Une salle fermée ne porte que {@code endReason}.
 */
public record RankingRoomView(
    boolean active,
    EndReason endReason,
    UUID facilitatorId,
    boolean live,
    RankingDraft draft,
    List<CardOpinion> opinions,
    UUID spotlightFeatureId) {

  /** Pourquoi la salle s'est fermée. */
  public enum EndReason {
    SAVED,
    CANCELLED,
    FACILITATOR_LEFT,
    FACILITATOR_CHANGED,
    SESSION_CLOSED
  }

  static RankingRoomView of(RankingRoom room) {
    return new RankingRoomView(
        true,
        null,
        room.facilitatorId(),
        room.live(),
        room.draft(),
        room.opinions(),
        room.spotlightFeatureId());
  }

  static RankingRoomView ended(EndReason reason) {
    return new RankingRoomView(false, reason, null, false, null, List.of(), null);
  }
}
