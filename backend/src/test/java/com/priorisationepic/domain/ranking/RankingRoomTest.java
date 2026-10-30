package com.priorisationepic.domain.ranking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.domain.ranking.RankingRefusedException.Reason;
import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.domain.scale.ScaleType;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Salle de classement collaboratif : brouillon diffusé, avis et carte en discussion (FR-015b). */
class RankingRoomTest {

  private static final UUID ERIC = UUID.fromString("00000000-0000-4000-8000-0000000000e1");
  private static final UUID ALICE = UUID.fromString("00000000-0000-4000-8000-0000000000a1");
  private static final UUID BOB = UUID.fromString("00000000-0000-4000-8000-0000000000b1");
  private static final UUID F1 = UUID.fromString("00000000-0000-4000-8000-000000000001");
  private static final UUID F2 = UUID.fromString("00000000-0000-4000-8000-000000000002");
  private static final UUID F3 = UUID.fromString("00000000-0000-4000-8000-000000000003");
  private static final List<String> METHOD = List.of("bv", "tc", "rrOe", "js");
  private static final Scale FIBONACCI = new Scale(ScaleType.FIBONACCI, 20);

  /** BV et JS choisis ; BV en cours : F-1 (8), puis F-2 et F-3 à égalité (5). */
  private static RankingDraft draft() {
    return new RankingDraft(
        List.of("bv", "js"),
        "bv",
        List.of(List.of(F1), List.of(F2, F3)),
        List.of(),
        Map.of(F1, 8, F2, 5, F3, 5));
  }

  private static Reason refusal(Runnable action) {
    try {
      action.run();
    } catch (RankingRefusedException e) {
      return e.reason();
    }
    throw new AssertionError("L'action aurait dû être refusée");
  }

  // --- Brouillon -------------------------------------------------------------------------------

  @Test
  void aDraftKnowsItsFeaturesRankedOrNot() {
    RankingDraft draft =
        new RankingDraft(List.of("js"), "js", List.of(List.of(F1)), List.of(F2, F3), Map.of(F1, 3));

    assertThat(draft.features()).containsExactlyInAnyOrder(F1, F2, F3);
    assertThat(draft.contains(F2)).isTrue();
    assertThat(draft.contains(UUID.randomUUID())).isFalse();
  }

  @Test
  void aFeatureListedTwiceIsRefused() {
    assertThat(
            refusal(
                () ->
                    new RankingDraft(
                        List.of("bv"),
                        "bv",
                        List.of(List.of(F1), List.of(F1)),
                        List.of(),
                        Map.of())))
        .isEqualTo(Reason.DUPLICATE_FEATURE);
    assertThat(
            refusal(
                () ->
                    new RankingDraft(
                        List.of("bv"), "bv", List.of(List.of(F1)), List.of(F1), Map.of())))
        .isEqualTo(Reason.DUPLICATE_FEATURE);
  }

  @Test
  void theCurrentCriterionIsOneOfTheChosenCriteria() {
    assertThat(
            refusal(() -> new RankingDraft(List.of("bv"), "js", List.of(), List.of(F1), Map.of())))
        .isEqualTo(Reason.INVALID_DRAFT);
    assertThat(refusal(() -> new RankingDraft(List.of(), "bv", List.of(), List.of(F1), Map.of())))
        .isEqualTo(Reason.INVALID_DRAFT);
    assertThat(
            refusal(
                () ->
                    new RankingDraft(List.of("bv", "bv"), "bv", List.of(), List.of(F1), Map.of())))
        .isEqualTo(Reason.INVALID_DRAFT);
  }

  @Test
  void onlyRankedFeaturesHaveAValueAndLevelsAreNeverEmpty() {
    assertThat(
            refusal(
                () -> new RankingDraft(List.of("bv"), "bv", List.of(), List.of(F1), Map.of(F1, 3))))
        .isEqualTo(Reason.INVALID_DRAFT);
    assertThat(
            refusal(
                () ->
                    new RankingDraft(
                        List.of("bv"), "bv", List.of(List.of()), List.of(F1), Map.of())))
        .isEqualTo(Reason.INVALID_DRAFT);
    assertThat(
            refusal(
                () ->
                    new RankingDraft(
                        List.of("bv"), "bv", List.of(List.of(F1)), List.of(), Map.of(F1, 0))))
        .isEqualTo(Reason.INVALID_DRAFT);
  }

  @Test
  void aMissingValueMeansNoValue() {
    Map<UUID, Integer> values = new HashMap<>();
    values.put(F1, null);

    RankingDraft draft =
        new RankingDraft(List.of("bv"), "bv", List.of(List.of(F1)), List.of(), values);

    assertThat(draft.values()).isEmpty();
  }

  @Test
  void aDraftIsCheckedAgainstTheMethodTheScaleAndTheOpenRound() {
    draft().requireAllowed(METHOD, FIBONACCI, Set.of());

    assertThat(refusal(() -> draft().requireAllowed(List.of("bv"), FIBONACCI, Set.of())))
        .isEqualTo(Reason.UNKNOWN_CRITERION);
    assertThat(
            refusal(
                () ->
                    new RankingDraft(
                            List.of("bv"), "bv", List.of(List.of(F1)), List.of(), Map.of(F1, 4))
                        .requireAllowed(METHOD, FIBONACCI, Set.of())))
        .isEqualTo(Reason.VALUE_OUT_OF_SCALE);
    assertThat(refusal(() -> draft().requireAllowed(METHOD, FIBONACCI, Set.of(F3))))
        .isEqualTo(Reason.FEATURE_IN_OPEN_ROUND);
  }

  @Test
  void aFeatureInAnOpenRoundIsNamedInTheRefusal() {
    try {
      draft().requireAllowed(METHOD, FIBONACCI, Set.of(F2));
    } catch (RankingRefusedException e) {
      assertThat(e.featureId()).isEqualTo(F2);
      return;
    }
    throw new AssertionError("Le brouillon aurait dû être refusé");
  }

  @Test
  void featuresNoLongerInTheSessionAreLeftOut() {
    RankingDraft kept = draft().retainOnly(Set.of(F1, F2));

    assertThat(kept.levels()).containsExactly(List.of(F1), List.of(F2));
    assertThat(kept.values()).containsOnlyKeys(F1, F2);

    RankingDraft emptied = draft().retainOnly(Set.of(F2, F3));
    assertThat(emptied.levels()).containsExactly(List.of(F2, F3));
    assertThat(emptied.values()).containsOnlyKeys(F2, F3);
  }

  @Test
  void aDraftIsAnImmutableCopy() {
    List<UUID> unranked = new java.util.ArrayList<>(List.of(F2));
    RankingDraft draft =
        new RankingDraft(List.of("bv"), "bv", List.of(List.of(F1)), unranked, Map.of());
    unranked.add(F3);

    assertThat(draft.unranked()).containsExactly(F2);
    assertThatThrownBy(() -> draft.levels().add(List.of(F3)))
        .isInstanceOf(UnsupportedOperationException.class);
  }

  // --- Diffusion -------------------------------------------------------------------------------

  @Test
  void theFirstDraftOpensALiveRoom() {
    RankingRoom room = RankingRoom.open(ERIC, draft());

    assertThat(room.facilitatorId()).isEqualTo(ERIC);
    assertThat(room.live()).isTrue();
    assertThat(room.draft()).isEqualTo(draft());
    assertThat(room.opinions()).isEmpty();
    assertThat(room.spotlightFeatureId()).isNull();
  }

  @Test
  void pausingKeepsTheLastBroadcastDraftUntilTheNextOne() {
    RankingRoom room = RankingRoom.open(ERIC, draft());

    room.pause();
    assertThat(room.live()).isFalse();
    assertThat(room.draft()).isEqualTo(draft());

    RankingDraft next =
        new RankingDraft(List.of("bv", "js"), "js", List.of(), List.of(F1, F2, F3), Map.of());
    room.broadcast(next);
    assertThat(room.live()).isTrue();
    assertThat(room.draft()).isEqualTo(next);
  }

  // --- Avis ------------------------------------------------------------------------------------

  @Test
  void eachMemberHasOneOpinionPerFeatureAndCriterion() {
    RankingRoom room = RankingRoom.open(ERIC, draft());

    room.giveOpinion(ALICE, F2, "bv", Opinion.RAISE, null, null);
    room.giveOpinion(BOB, F2, "bv", Opinion.AGREE, null, null);
    room.giveOpinion(ALICE, F2, "bv", Opinion.LOWER, null, null);
    room.giveOpinion(ALICE, F2, "js", Opinion.AGREE, null, null);

    assertThat(room.opinions())
        .containsExactly(
            new CardOpinion(F2, "bv", ALICE, Opinion.LOWER, null, null),
            new CardOpinion(F2, "bv", BOB, Opinion.AGREE, null, null),
            new CardOpinion(F2, "js", ALICE, Opinion.AGREE, null, null));
  }

  @Test
  void theCommentIsOptionalKeptWhenTheOpinionChangesAndClearedByAnEmptyText() {
    RankingRoom room = RankingRoom.open(ERIC, draft());

    room.giveOpinion(ALICE, F2, "bv", Opinion.RAISE, "Le salon de mars en dépend.", null);
    room.giveOpinion(ALICE, F2, "bv", Opinion.LOWER, null, null);
    assertThat(room.opinions().getFirst().comment()).isEqualTo("Le salon de mars en dépend.");

    room.giveOpinion(ALICE, F2, "bv", Opinion.LOWER, "Plutôt après F-3.", null);
    assertThat(room.opinions().getFirst().comment()).isEqualTo("Plutôt après F-3.");

    room.giveOpinion(ALICE, F2, "bv", Opinion.LOWER, "", null);
    assertThat(room.opinions().getFirst().comment()).isNull();
  }

  @Test
  void aMoveCarriesTheWantedValueKeptUntilItsDirectionChanges() {
    RankingRoom room = RankingRoom.open(ERIC, draft());

    room.giveOpinion(ALICE, F2, "bv", Opinion.RAISE, null, 13);
    assertThat(room.opinions().getFirst().value()).isEqualTo(13);

    room.giveOpinion(ALICE, F2, "bv", Opinion.RAISE, "Urgent.", null);
    assertThat(room.opinions().getFirst().value()).isEqualTo(13);

    room.giveOpinion(ALICE, F2, "bv", Opinion.LOWER, null, null);
    assertThat(room.opinions().getFirst().value()).isNull();

    assertThat(refusal(() -> room.giveOpinion(ALICE, F2, "bv", Opinion.AGREE, null, 5)))
        .isEqualTo(Reason.VALUE_WITHOUT_MOVE);
  }

  @Test
  void aCommentHasAtMost140Characters() {
    RankingRoom room = RankingRoom.open(ERIC, draft());

    room.giveOpinion(ALICE, F2, "bv", Opinion.RAISE, "é".repeat(140), null);
    assertThat(
            refusal(() -> room.giveOpinion(ALICE, F2, "bv", Opinion.RAISE, "é".repeat(141), null)))
        .isEqualTo(Reason.COMMENT_TOO_LONG);
    assertThat(room.opinions().getFirst().comment()).hasSize(140);
  }

  @Test
  void withdrawingAnOpinionRemovesItsComment() {
    RankingRoom room = RankingRoom.open(ERIC, draft());
    room.giveOpinion(ALICE, F2, "bv", Opinion.RAISE, "Urgent.", null);

    room.giveOpinion(ALICE, F2, "bv", null, null, null);
    assertThat(room.opinions()).isEmpty();

    room.giveOpinion(ALICE, F2, "bv", Opinion.AGREE, null, null);
    assertThat(room.opinions().getFirst().comment()).isNull();

    // Retirer un avis absent ne change rien.
    room.giveOpinion(BOB, F2, "bv", null, null, null);
    assertThat(room.opinions()).hasSize(1);
  }

  @Test
  void anOpinionIsOnlyGivenOnTheDraft() {
    RankingRoom room = RankingRoom.open(ERIC, draft());

    assertThat(
            refusal(
                () -> room.giveOpinion(ALICE, UUID.randomUUID(), "bv", Opinion.AGREE, null, null)))
        .isEqualTo(Reason.NOT_IN_RANKING);
    assertThat(refusal(() -> room.giveOpinion(ALICE, F2, "tc", Opinion.AGREE, null, null)))
        .isEqualTo(Reason.NOT_IN_RANKING);
    assertThat(room.opinions()).isEmpty();
  }

  @Test
  void opinionsStayWithTheirCriterionWhenTheCardMoves() {
    RankingRoom room = RankingRoom.open(ERIC, draft());
    room.giveOpinion(ALICE, F2, "bv", Opinion.RAISE, null, null);

    room.broadcast(
        new RankingDraft(
            List.of("bv", "js"),
            "bv",
            List.of(List.of(F2), List.of(F1, F3)),
            List.of(),
            Map.of(F2, 8, F1, 5, F3, 5)));

    assertThat(room.opinions())
        .containsExactly(new CardOpinion(F2, "bv", ALICE, Opinion.RAISE, null, null));
  }

  @Test
  void opinionsOnFeaturesOrCriteriaLeftOutOfTheDraftAreDropped() {
    RankingRoom room = RankingRoom.open(ERIC, draft());
    room.giveOpinion(ALICE, F1, "bv", Opinion.AGREE, null, null);
    room.giveOpinion(ALICE, F2, "js", Opinion.RAISE, null, null);
    room.giveOpinion(BOB, F3, "bv", Opinion.LOWER, null, null);

    room.broadcast(
        new RankingDraft(
            List.of("bv"),
            "bv",
            List.of(List.of(F1), List.of(F2)),
            List.of(),
            Map.of(F1, 8, F2, 5)));

    assertThat(room.opinions())
        .containsExactly(new CardOpinion(F1, "bv", ALICE, Opinion.AGREE, null, null));
  }

  @Test
  void theFacilitatorClearsTheOpinionsOfACardForACriterion() {
    RankingRoom room = RankingRoom.open(ERIC, draft());
    room.giveOpinion(ALICE, F2, "bv", Opinion.RAISE, "Urgent.", null);
    room.giveOpinion(BOB, F2, "bv", Opinion.LOWER, null, null);
    room.giveOpinion(BOB, F2, "js", Opinion.AGREE, null, null);
    room.giveOpinion(BOB, F1, "bv", Opinion.AGREE, null, null);

    room.clearOpinions(F2, "bv");

    assertThat(room.opinions())
        .containsExactly(
            new CardOpinion(F2, "js", BOB, Opinion.AGREE, null, null),
            new CardOpinion(F1, "bv", BOB, Opinion.AGREE, null, null));
    assertThat(refusal(() -> room.clearOpinions(UUID.randomUUID(), "bv")))
        .isEqualTo(Reason.NOT_IN_RANKING);
    assertThat(refusal(() -> room.clearOpinions(F2, "tc"))).isEqualTo(Reason.NOT_IN_RANKING);
  }

  // --- Carte en discussion ---------------------------------------------------------------------

  @Test
  void oneCardIsUnderDiscussionAtATime() {
    RankingRoom room = RankingRoom.open(ERIC, draft());

    room.spotlight(F2);
    assertThat(room.spotlightFeatureId()).isEqualTo(F2);

    room.spotlight(F3);
    assertThat(room.spotlightFeatureId()).isEqualTo(F3);

    room.spotlight(null);
    assertThat(room.spotlightFeatureId()).isNull();

    assertThat(refusal(() -> room.spotlight(UUID.randomUUID()))).isEqualTo(Reason.NOT_IN_RANKING);
  }

  @Test
  void aCardLeavingTheDiscussionIsMarkedDiscussedForItsCriterion() {
    RankingRoom room = RankingRoom.open(ERIC, draft());
    room.spotlight(F2);
    assertThat(room.discussed()).isEmpty();

    room.spotlight(F2);
    assertThat(room.discussed()).isEmpty();

    room.spotlight(F3);
    room.broadcast(
        new RankingDraft(
            List.of("bv", "js"),
            "js",
            List.of(List.of(F1), List.of(F2, F3)),
            List.of(),
            Map.of(F1, 3, F2, 2, F3, 2)));
    room.spotlight(null);

    assertThat(room.discussed())
        .containsExactly(new DiscussedCard(F2, "bv"), new DiscussedCard(F3, "bv"));
  }

  @Test
  void aChangedOpinionOrWantedValueReopensTheDiscussionButNotAComment() {
    RankingRoom room = RankingRoom.open(ERIC, draft());
    room.giveOpinion(ALICE, F2, "bv", Opinion.RAISE, null, 13);
    room.spotlight(F2);
    room.spotlight(null);

    room.giveOpinion(ALICE, F2, "bv", Opinion.RAISE, "Le salon de mars", null);
    room.giveOpinion(BOB, F2, "js", Opinion.LOWER, null, null);
    assertThat(room.discussed()).containsExactly(new DiscussedCard(F2, "bv"));

    room.giveOpinion(ALICE, F2, "bv", Opinion.RAISE, null, 20);
    assertThat(room.discussed()).isEmpty();

    room.spotlight(F2);
    room.spotlight(null);
    room.giveOpinion(BOB, F2, "bv", Opinion.AGREE, null, null);
    assertThat(room.discussed()).isEmpty();

    room.spotlight(F2);
    room.spotlight(null);
    room.giveOpinion(BOB, F2, "bv", null, null, null);
    assertThat(room.discussed()).isEmpty();
  }

  @Test
  void clearingTheOpinionsOrRemovingTheCardForgetsItsDiscussion() {
    RankingRoom room = RankingRoom.open(ERIC, draft());
    room.spotlight(F2);
    room.spotlight(F3);
    room.spotlight(null);

    room.clearOpinions(F2, "bv");
    room.broadcast(draft().retainOnly(Set.of(F1, F2)));

    assertThat(room.discussed()).isEmpty();
  }

  @Test
  void theDiscussionEndsWhenItsCardLeavesTheDraft() {
    RankingRoom room = RankingRoom.open(ERIC, draft());
    room.spotlight(F3);

    room.broadcast(draft().retainOnly(Set.of(F1, F2)));

    assertThat(room.spotlightFeatureId()).isNull();
  }

  @Test
  void theDiscussionGoesOnWhileItsCardMoves() {
    RankingRoom room = RankingRoom.open(ERIC, draft());
    room.spotlight(F3);

    room.broadcast(
        new RankingDraft(
            List.of("bv", "js"),
            "bv",
            List.of(List.of(F3), List.of(F1, F2)),
            List.of(),
            Map.of(F3, 8, F1, 5, F2, 5)));

    assertThat(room.spotlightFeatureId()).isEqualTo(F3);
  }
}
