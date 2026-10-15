package com.priorisationepic.domain.method;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.domain.scale.Scale;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.junit.jupiter.api.Test;

/**
 * WSJF version 2 : le JS et au moins un critère parmi BV, TC et RR/OE suffisent au calcul ; un
 * critère du CoD sans valeur compte 0. La version 1 garde sa règle : les quatre critères.
 */
class WsjfVersion2Test {

  private static final WsjfMethod V1 = WsjfMethod.version1();
  private static final WsjfMethod V2 = WsjfMethod.version2();
  private static final Scale SCALE = Scale.defaultScale();

  private static Criteria criteria(Integer bv, Integer tc, Integer rrOe, Integer js) {
    Map<String, Integer> values = new LinkedHashMap<>();
    values.put("bv", bv);
    values.put("tc", tc);
    values.put("rrOe", rrOe);
    values.put("js", js);
    values.values().removeIf(Objects::isNull);
    return Criteria.of(V2.definition(), values);
  }

  private static Score score(Integer bv, Integer tc, Integer rrOe, Integer js) {
    return Score.of(V2, criteria(bv, tc, rrOe, js), SCALE);
  }

  @Test
  void computesWithTheJobSizeAndASingleBenefitCountingTheMissingOnesAsZero() {
    Score score = score(8, null, 3, 4);

    assertThat(score.complete()).isTrue();
    assertThat(score.computed().get("cod").display(Display.INTEGER)).isEqualTo("11");
    assertThat(score.computed().get("wsjf").display(Display.DECIMAL_2)).isEqualTo("2,75");
    assertThat(score.explanation())
        .isEqualTo("CoD = 8 + 0 + 3 = 11 (TC sans valeur, compté 0) ; WSJF = 11 / 4 = 2,75");
  }

  @Test
  void namesEveryMissingBenefitInTheExplanation() {
    assertThat(score(null, 5, null, 2).explanation())
        .isEqualTo(
            "CoD = 0 + 5 + 0 = 5 (BV et RR/OE sans valeur, comptés 0) ; WSJF = 5 / 2 = 2,50");
  }

  @Test
  void explainsAFullFeatureExactlyLikeVersion1() {
    assertThat(score(8, 5, 3, 4).explanation())
        .isEqualTo("CoD = 8 + 5 + 3 = 16 ; WSJF = 16 / 4 = 4,00");
  }

  @Test
  void needsTheJobSize() {
    Score score = score(8, 5, 3, null);

    assertThat(score.complete()).isFalse();
    assertThat(score.computed()).isNull();
    assertThat(score.explanation()).isNull();
  }

  @Test
  void needsAtLeastOneBenefit() {
    assertThat(score(null, null, null, 4).complete()).isFalse();
  }

  @Test
  void stillRefusesAnEnteredValueOutOfScale() {
    Score score = score(11, null, null, 4);

    assertThat(score.complete()).isFalse();
    assertThat(score.outOfScale()).containsExactly("bv");
  }

  @Test
  void version1StillNeedsTheFourCriteria() {
    Criteria partial = criteria(8, null, 3, 4);

    assertThat(Score.of(V1, partial, SCALE).complete()).isFalse();
    assertThat(V1.definition().formula()).isEqualTo("CoD = BV + TC + RR/OE ; WSJF = CoD / JS");
  }

  @Test
  void ranksAPartialFeatureAmongTheComputedOnesAndTheIncompleteOnesLast() {
    record Item(String id, Score score) {}
    List<Item> items =
        List.of(
            new Item("A", score(2, 2, 2, 3)), // WSJF 2,00
            new Item("B", score(null, null, null, 4)), // sans bénéfice : en fin
            new Item("C", score(9, null, null, 3)), // WSJF 3,00
            new Item("D", score(8, 5, 3, null))); // sans JS : en fin

    List<String> order =
        Ranking.rank(V2, items, Item::id, Item::score).stream().map(r -> r.item().id()).toList();

    assertThat(order).containsExactly("C", "A", "B", "D");
  }
}
