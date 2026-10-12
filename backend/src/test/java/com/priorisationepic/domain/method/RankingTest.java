package com.priorisationepic.domain.method;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.scale.Scale;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RankingTest {

  private static final SessionId SESSION = new SessionId("a".repeat(22));
  private static final WsjfMethod WSJF = new WsjfMethod();
  private static final Scale SCALE = Scale.defaultScale();

  static Feature feature(String externalId, Integer bv, Integer tc, Integer rrOe, Integer js) {
    Map<String, Integer> values = new java.util.HashMap<>();
    values.put("bv", bv);
    values.put("tc", tc);
    values.put("rrOe", rrOe);
    values.put("js", js);
    return Feature.create(
        UUID.randomUUID(),
        SESSION,
        externalId,
        "Titre " + externalId,
        null,
        new Criteria(WSJF.definition(), values),
        Scale.continuous(100));
  }

  private static List<String> order(List<RankedFeature> ranked) {
    return ranked.stream().map(r -> r.feature().externalId()).toList();
  }

  @Test
  void acceptanceScenarioOne() {
    Score score = Score.of(WSJF, feature("F-1", 8, 5, 3, 4).criteria(), SCALE);
    assertThat(score.complete()).isTrue();
    assertThat(score.computed().get("cod").display()).isEqualTo("16");
    assertThat(score.computed().get("wsjf").display()).isEqualTo("4,00");
    assertThat(score.explanation()).contains("CoD = 8 + 5 + 3 = 16 ; WSJF = 16 / 4 = 4,00");
  }

  @Test
  void acceptanceScenarioTwoJobSizeChangeReorders() {
    Feature f1 = feature("F-1", 8, 5, 3, 4);
    Feature f2 = feature("F-2", 2, 2, 2, 3);
    assertThat(order(Ranking.rank(WSJF, SCALE, List.of(f1, f2)))).containsExactly("F-1", "F-2");

    Feature f1Bigger = feature("F-1", 8, 5, 3, 10);
    List<RankedFeature> ranked = Ranking.rank(WSJF, SCALE, List.of(f1Bigger, f2));
    assertThat(order(ranked)).containsExactly("F-2", "F-1");
    assertThat(ranked.get(0).score().computed().get("wsjf").display()).isEqualTo("2,00");
    assertThat(ranked.get(1).score().computed().get("wsjf").display()).isEqualTo("1,60");
    assertThat(ranked.get(0).score().rank()).isEqualTo(1);
    assertThat(ranked.get(1).score().rank()).isEqualTo(2);
  }

  @Test
  void tieOnWsjfIsBrokenByHigherCod() {
    // 12/4 = 3 ; 6/2 = 3 : même WSJF, CoD 12 devant CoD 6
    Feature small = feature("A", 2, 2, 2, 2);
    Feature big = feature("B", 6, 3, 3, 4);
    assertThat(order(Ranking.rank(WSJF, SCALE, List.of(small, big)))).containsExactly("B", "A");
  }

  @Test
  void tieOnWsjfAndCodIsBrokenByExternalIdIgnoringCase() {
    Feature b = feature("b-2", 3, 3, 3, 3);
    Feature a = feature("A-1", 3, 3, 3, 3);
    Feature c = feature("C-3", 3, 3, 3, 3);
    assertThat(order(Ranking.rank(WSJF, SCALE, List.of(c, b, a))))
        .containsExactly("A-1", "b-2", "C-3");
  }

  @Test
  void incompleteFeaturesComeLastSortedByExternalId() {
    Feature complete = feature("Z", 1, 1, 1, 10);
    Feature missingJs = feature("B", 9, 9, 9, null);
    Feature empty = feature("a", null, null, null, null);
    Feature outOfScale = feature("C", 9, 9, 9, 11);
    List<RankedFeature> ranked =
        Ranking.rank(WSJF, SCALE, List.of(missingJs, empty, complete, outOfScale));
    assertThat(order(ranked)).containsExactly("Z", "a", "B", "C");
    assertThat(ranked.get(1).score().complete()).isFalse();
    assertThat(ranked.get(3).score().rank()).isEqualTo(4);
  }

  @Test
  void deletedFeaturesAreLeftOut() {
    Feature kept = feature("K", 1, 1, 1, 1);
    Feature gone = feature("G", 1, 1, 1, 1).delete(Instant.parse("2026-01-01T00:00:00Z"));
    assertThat(order(Ranking.rank(WSJF, SCALE, List.of(gone, kept)))).containsExactly("K");
  }

  @Test
  void emptyInputGivesEmptyRanking() {
    assertThat(Ranking.rank(WSJF, SCALE, List.of())).isEmpty();
  }

  @Test
  void doesNotMutateTheInput() {
    List<Feature> input =
        new ArrayList<>(List.of(feature("B", 1, 1, 1, 5), feature("A", 9, 9, 9, 1)));
    List<Feature> copy = List.copyOf(input);
    Ranking.rank(WSJF, SCALE, input);
    assertThat(input).isEqualTo(copy);
  }

  @Test
  void roundsHalfUpToTwoDecimalsWithComma() {
    assertThat(wsjfDisplay(4, 3, 3, 8)).isEqualTo("1,25");
    assertThat(wsjfDisplay(1, 1, 1, 8)).isEqualTo("0,38");
    assertThat(wsjfDisplay(1, 1, 1, 9)).isEqualTo("0,33");
    assertThat(wsjfDisplay(2, 1, 1, 6)).isEqualTo("0,67");
    assertThat(wsjfDisplay(5, 5, 6, 3)).isEqualTo("5,33");
    assertThat(wsjfDisplay(1, 1, 3, 5)).isEqualTo("1,00");
    assertThat(wsjfDisplay(1, 1, 1, 10)).isEqualTo("0,30");
    assertThat(wsjfDisplay(3, 2, 1, 7)).isEqualTo("0,86");
    assertThat(wsjfDisplay(10, 10, 10, 1)).isEqualTo("30,00");
  }

  private static String wsjfDisplay(int bv, int tc, int rrOe, int js) {
    return Score.of(WSJF, feature("X", bv, tc, rrOe, js).criteria(), SCALE)
        .computed()
        .get("wsjf")
        .display();
  }

  @Test
  void explanationUsesRealValues() {
    Score score = Score.of(WSJF, feature("F", 8, 5, 3, 10).criteria(), SCALE);
    assertThat(score.explanation()).contains("CoD = 8 + 5 + 3 = 16 ; WSJF = 16 / 10 = 1,60");
  }

  @Test
  void equalKeysDifferingByCaseStillGiveAStableTotalOrder() {
    Feature lower = feature("a", 3, 3, 3, 3);
    Feature upper = feature("A", 3, 3, 3, 3);
    assertThat(order(Ranking.rank(WSJF, SCALE, List.of(lower, upper)))).containsExactly("A", "a");
    assertThat(order(Ranking.rank(WSJF, SCALE, List.of(upper, lower)))).containsExactly("A", "a");
    Feature twinA = feature("A", 3, 3, 3, 3);
    Feature twinB = feature("A", 3, 3, 3, 3);
    List<RankedFeature> ranked = Ranking.rank(WSJF, SCALE, List.of(twinA, twinB));
    assertThat(ranked.get(0).feature().id())
        .isEqualTo(twinA.id().compareTo(twinB.id()) < 0 ? twinA.id() : twinB.id());
  }
}
