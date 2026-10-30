package com.priorisationepic.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.application.RankingRoomView.EndReason;
import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.SessionStatus.Action;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.ranking.CardOpinion;
import com.priorisationepic.domain.ranking.Opinion;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Salle de classement collaboratif : droits, refus, diffusion et fin (FR-015b, FR-015c). */
class RankingRoomUseCaseTest {

  private final MutableClock clock = new MutableClock(Instant.parse("2026-10-29T08:00:00Z"));
  private final InMemoryStore store = new InMemoryStore();
  private final RecordingBroadcaster broadcaster = new RecordingBroadcaster();
  private final IdGenerator ids = new IdGenerator(new Random(11));
  private final MethodRegistry methods = MethodRegistry.standard();
  private final SessionLocks locks = new SessionLocks();
  private final Set<UUID> inOpenRound = new HashSet<>();

  private SessionId session;
  private UUID alice;
  private UUID bob;
  private UUID f1;
  private UUID f2;
  private UUID f3;
  private RankingRoomUseCase rooms;

  @BeforeEach
  void setUp() {
    session =
        new CreateSessionUseCase(store, store, methods, ids, clock::instant, store)
            .create(new CreateSessionUseCase.Command("Atelier", "Alice", null, null))
            .sessionId();
    new JoinSessionUseCase(
            store, store, broadcaster, locks, ids, clock::instant, store, Duration.ofMinutes(10))
        .join(session.value(), "Bob", null);
    alice = store.list(session).getFirst().id();
    bob = store.list(session).get(1).id();
    FeatureUseCase features =
        new FeatureUseCase(
            store,
            store,
            store,
            new ChangeLogWriter(store, clock::instant, ids),
            methods,
            broadcaster,
            locks,
            ids,
            clock::instant,
            store);
    for (String id : List.of("F-1", "F-2", "F-3")) {
      features.add(session, alice, true, new FeatureUseCase.Add(id, id, null, Map.of()));
    }
    List<UUID> created = store.features.keySet().stream().toList();
    f1 = created.get(0);
    f2 = created.get(1);
    f3 = created.get(2);
    broadcaster.attach("alice-1", session, alice, true);
    broadcaster.attach("bob-1", session, bob, false);
    broadcaster.published.clear();
    RoundRepository rounds =
        new RoundRepository() {
          @Override
          public boolean hasOpenRound(SessionId sessionId) {
            return !inOpenRound.isEmpty();
          }

          @Override
          public Set<UUID> featuresInOpenRound(SessionId sessionId) {
            return Set.copyOf(inOpenRound);
          }
        };
    rooms = new RankingRoomUseCase(store, store, rounds, methods, broadcaster, locks);
  }

  /** BV et JS choisis ; BV en cours : F-1 (8), puis F-2 et F-3 à égalité (5). */
  private RankingRoomUseCase.Draft draft() {
    return new RankingRoomUseCase.Draft(
        List.of("bv", "js"),
        "bv",
        List.of(List.of(f1), List.of(f2, f3)),
        List.of(),
        Map.of(f1, 8, f2, 5, f3, 5));
  }

  private void open() {
    rooms.updateDraft(session, alice, true, true, draft());
  }

  private RankingRoomView last() {
    return broadcaster.rooms.getLast();
  }

  private static ErrorCode rejection(Runnable action) {
    try {
      action.run();
    } catch (IntentRejectedException e) {
      return e.code();
    }
    throw new AssertionError("L'intention aurait dû être refusée");
  }

  // --- Ouverture et diffusion ------------------------------------------------------------------

  @Test
  void theFirstLiveDraftOpensTheRoomForEveryoneWithoutWritingAnything() {
    int version = store.find(session).orElseThrow().version();

    open();

    RankingRoomView room = last();
    assertThat(room.active()).isTrue();
    assertThat(room.facilitatorId()).isEqualTo(alice);
    assertThat(room.live()).isTrue();
    assertThat(room.draft().levels()).containsExactly(List.of(f1), List.of(f2, f3));
    assertThat(room.opinions()).isEmpty();
    assertThat(room.spotlightFeatureId()).isNull();
    assertThat(broadcaster.published).isEmpty();
    assertThat(store.find(session).orElseThrow().version()).isEqualTo(version);
    assertThat(store.changeLog).isEmpty();
  }

  @Test
  void pausingKeepsTheLastBroadcastDraft() {
    open();

    rooms.updateDraft(session, alice, true, false, null);

    assertThat(last().live()).isFalse();
    assertThat(last().draft().levels()).containsExactly(List.of(f1), List.of(f2, f3));
  }

  @Test
  void aFeatureDeletedMeanwhileIsLeftOutOfTheBroadcast() {
    UUID gone = UUID.randomUUID();

    rooms.updateDraft(
        session,
        alice,
        true,
        true,
        new RankingRoomUseCase.Draft(
            List.of("bv"), "bv", List.of(List.of(f1, gone)), List.of(f2), Map.of(f1, 8, gone, 8)));

    assertThat(last().draft().levels()).containsExactly(List.of(f1));
    assertThat(last().draft().values()).containsOnlyKeys(f1);
  }

  @Test
  void aDraftIsCheckedAgainstTheSession() {
    assertThat(
            rejection(
                () ->
                    rooms.updateDraft(
                        session,
                        alice,
                        true,
                        true,
                        new RankingRoomUseCase.Draft(
                            List.of("zz"), "zz", List.of(), List.of(f1), Map.of()))))
        .isEqualTo(ErrorCode.UNKNOWN_CRITERION);
    assertThat(
            rejection(
                () ->
                    rooms.updateDraft(
                        session,
                        alice,
                        true,
                        true,
                        new RankingRoomUseCase.Draft(
                            List.of("bv"), "bv", List.of(List.of(f1)), List.of(), Map.of(f1, 11)))))
        .isEqualTo(ErrorCode.INVALID_VALUE);
    assertThat(
            rejection(
                () ->
                    rooms.updateDraft(
                        session,
                        alice,
                        true,
                        true,
                        new RankingRoomUseCase.Draft(
                            List.of("bv"), "bv", List.of(List.of(f1)), List.of(f1), Map.of()))))
        .isEqualTo(ErrorCode.INVALID_MESSAGE);
    assertThat(
            rejection(
                () ->
                    rooms.updateDraft(
                        session,
                        alice,
                        true,
                        true,
                        new RankingRoomUseCase.Draft(
                            List.of("bv"), "js", List.of(), List.of(f1), Map.of()))))
        .isEqualTo(ErrorCode.INVALID_MESSAGE);
    assertThat(rejection(() -> rooms.updateDraft(session, alice, true, true, null)))
        .isEqualTo(ErrorCode.INVALID_MESSAGE);
    assertThat(broadcaster.rooms).isEmpty();
  }

  @Test
  void aFeatureInAnOpenRoundIsRefusedAndNamed() {
    inOpenRound.add(f2);
    try {
      open();
    } catch (IntentRejectedException e) {
      assertThat(e.code()).isEqualTo(ErrorCode.FEATURE_IN_OPEN_ROUND);
      assertThat(e.featureId()).isEqualTo(f2);
      assertThat(broadcaster.rooms).isEmpty();
      return;
    }
    throw new AssertionError("Le brouillon aurait dû être refusé");
  }

  // --- Droits ----------------------------------------------------------------------------------

  @Test
  void onlyTheFacilitatorDraftsClearsSpotlightsAndEnds() {
    assertThat(rejection(() -> rooms.updateDraft(session, bob, false, true, draft())))
        .isEqualTo(ErrorCode.FORBIDDEN);
    open();
    assertThat(rejection(() -> rooms.clearOpinions(session, false, f2, "bv")))
        .isEqualTo(ErrorCode.FORBIDDEN);
    assertThat(rejection(() -> rooms.setSpotlight(session, false, f2)))
        .isEqualTo(ErrorCode.FORBIDDEN);
    assertThat(rejection(() -> rooms.end(session, false, EndReason.CANCELLED)))
        .isEqualTo(ErrorCode.FORBIDDEN);
    assertThat(last().active()).isTrue();
  }

  @Test
  void theFacilitatorGivesNoOpinionTheyMoveTheCard() {
    open();

    assertThat(
            rejection(
                () -> rooms.giveOpinion(session, alice, true, f2, "bv", Opinion.RAISE, null, null)))
        .isEqualTo(ErrorCode.FORBIDDEN);
  }

  @Test
  void aClosedSessionRefusesTheRoom() {
    ChangeStatusUseCase statuses = new ChangeStatusUseCase(store, broadcaster, locks, store);
    statuses.change(session, true, Action.START);
    statuses.change(session, true, Action.CLOSE);

    assertThat(rejection(() -> open())).isEqualTo(ErrorCode.SESSION_CLOSED);
    assertThat(
            rejection(
                () -> rooms.giveOpinion(session, bob, false, f2, "bv", Opinion.AGREE, null, null)))
        .isEqualTo(ErrorCode.SESSION_CLOSED);
  }

  @Test
  void withoutAnOpenRoomOnlyADraftIsAccepted() {
    assertThat(
            rejection(
                () -> rooms.giveOpinion(session, bob, false, f2, "bv", Opinion.AGREE, null, null)))
        .isEqualTo(ErrorCode.NO_RANKING_IN_PROGRESS);
    assertThat(rejection(() -> rooms.clearOpinions(session, true, f2, "bv")))
        .isEqualTo(ErrorCode.NO_RANKING_IN_PROGRESS);
    assertThat(rejection(() -> rooms.setSpotlight(session, true, f2)))
        .isEqualTo(ErrorCode.NO_RANKING_IN_PROGRESS);
    assertThat(rejection(() -> rooms.end(session, true, EndReason.SAVED)))
        .isEqualTo(ErrorCode.NO_RANKING_IN_PROGRESS);
    assertThat(rejection(() -> rooms.updateDraft(session, alice, true, false, null)))
        .isEqualTo(ErrorCode.NO_RANKING_IN_PROGRESS);
  }

  // --- Avis et carte en discussion -------------------------------------------------------------

  @Test
  void aParticipantGivesAnOpinionWithAnOptionalComment() {
    open();

    rooms.giveOpinion(session, bob, false, f2, "bv", Opinion.RAISE, "Le salon de mars.", null);

    assertThat(last().opinions())
        .containsExactly(new CardOpinion(f2, "bv", bob, Opinion.RAISE, "Le salon de mars.", null));

    rooms.giveOpinion(session, bob, false, f2, "bv", null, null, null);
    assertThat(last().opinions()).isEmpty();
  }

  @Test
  void theWantedValueIsOnTheSessionScale() {
    open();

    rooms.giveOpinion(session, bob, false, f2, "bv", Opinion.RAISE, null, 8);
    assertThat(last().opinions().getFirst().value()).isEqualTo(8);

    assertThat(
            rejection(
                () -> rooms.giveOpinion(session, bob, false, f2, "bv", Opinion.RAISE, null, 1000)))
        .isEqualTo(ErrorCode.INVALID_VALUE);
    assertThat(
            rejection(
                () -> rooms.giveOpinion(session, bob, false, f2, "bv", Opinion.AGREE, null, 8)))
        .isEqualTo(ErrorCode.INVALID_MESSAGE);
  }

  @Test
  void anOpinionOutsideTheDraftOrTooLongIsRefused() {
    open();

    assertThat(
            rejection(
                () ->
                    rooms.giveOpinion(
                        session, bob, false, UUID.randomUUID(), "bv", Opinion.AGREE, null, null)))
        .isEqualTo(ErrorCode.NOT_IN_RANKING);
    assertThat(
            rejection(
                () -> rooms.giveOpinion(session, bob, false, f2, "tc", Opinion.AGREE, null, null)))
        .isEqualTo(ErrorCode.NOT_IN_RANKING);
    assertThat(
            rejection(
                () ->
                    rooms.giveOpinion(
                        session, bob, false, f2, "bv", Opinion.AGREE, "x".repeat(141), null)))
        .isEqualTo(ErrorCode.INVALID_MESSAGE);
  }

  @Test
  void theFacilitatorClearsOpinionsAndPutsACardUnderDiscussion() {
    open();
    rooms.giveOpinion(session, bob, false, f2, "bv", Opinion.RAISE, null, null);

    rooms.setSpotlight(session, true, f2);
    assertThat(last().spotlightFeatureId()).isEqualTo(f2);

    rooms.clearOpinions(session, true, f2, "bv");
    assertThat(last().opinions()).isEmpty();

    rooms.setSpotlight(session, true, null);
    assertThat(last().spotlightFeatureId()).isNull();

    assertThat(rejection(() -> rooms.setSpotlight(session, true, UUID.randomUUID())))
        .isEqualTo(ErrorCode.NOT_IN_RANKING);
  }

  // --- Connexions et fin -----------------------------------------------------------------------

  @Test
  void aConnectionOpenedDuringARankingReceivesTheRoom() {
    rooms.connected(session, "bob-2");
    assertThat(broadcaster.roomsTo).isEmpty();

    open();
    rooms.connected(session, "bob-2");

    assertThat(broadcaster.roomsTo.get("bob-2").active()).isTrue();
  }

  @Test
  void endingTheRankingSendsTheReasonAndClosesTheRoom() {
    open();

    rooms.end(session, true, EndReason.SAVED);

    assertThat(last().active()).isFalse();
    assertThat(last().endReason()).isEqualTo(EndReason.SAVED);
    assertThat(
            rejection(
                () -> rooms.giveOpinion(session, bob, false, f2, "bv", Opinion.AGREE, null, null)))
        .isEqualTo(ErrorCode.NO_RANKING_IN_PROGRESS);
  }

  @Test
  void theRoomEndsWhenTheFacilitatorsLastConnectionCloses() {
    open();

    broadcaster.detach("bob-1");
    rooms.connectionClosed(session);
    assertThat(last().active()).isTrue();

    broadcaster.attach("alice-2", session, alice, true);
    broadcaster.detach("alice-1");
    rooms.connectionClosed(session);
    assertThat(last().active()).isTrue();

    broadcaster.detach("alice-2");
    rooms.connectionClosed(session);
    assertThat(last().active()).isFalse();
    assertThat(last().endReason()).isEqualTo(EndReason.FACILITATOR_LEFT);

    int sent = broadcaster.rooms.size();
    rooms.connectionClosed(session);
    assertThat(broadcaster.rooms).hasSize(sent);
  }

  @Test
  void closingTheSessionEndsTheRoom() {
    ChangeStatusUseCase statuses =
        new ChangeStatusUseCase(store, broadcaster, locks, store, rooms::sessionClosed);
    statuses.change(session, true, Action.START);
    open();

    statuses.change(session, true, Action.START);
    assertThat(last().active()).isTrue();

    statuses.change(session, true, Action.CLOSE);
    assertThat(last().active()).isFalse();
    assertThat(last().endReason()).isEqualTo(EndReason.SESSION_CLOSED);
  }
}
