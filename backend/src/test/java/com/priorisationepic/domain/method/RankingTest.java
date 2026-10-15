package com.priorisationepic.domain.method;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.domain.scale.Scale;
import java.util.List;
import org.junit.jupiter.api.Test;

class RankingTest {

  private static final WsjfMethod WSJF = WsjfMethod.version1();
  private static final Scale SCALE = Scale.defaultScale();

  /** Une fonctionnalité de test : identifiant et valeurs retenues. */
  private record Item(String id, Score score) {}

  private static Item item(String id, Integer bv, Integer tc, Integer rrOe, Integer js) {
    java.util.Map<String, Integer> values = new java.util.LinkedHashMap<>();
    values.put("bv", bv);
    values.put("tc", tc);
    values.put("rrOe", rrOe);
    values.put("js", js);
    values.values().removeIf(java.util.Objects::isNull);
    return new Item(id, Score.of(WSJF, Criteria.of(WSJF.definition(), values), SCALE));
  }

  private static List<String> order(Item... items) {
    return Ranking.rank(WSJF, List.of(items), Item::id, Item::score).stream()
        .map(r -> r.item().id())
        .toList();
  }

  @Test
  void acceptanceScenario1ComputesCodAndWsjf() {
    Item f1 = item("F-1", 8, 5, 3, 4);

    assertThat(f1.score().complete()).isTrue();
    assertThat(f1.score().computed().get("cod").display(Display.INTEGER)).isEqualTo("16");
    assertThat(f1.score().computed().get("wsjf").display(Display.DECIMAL_2)).isEqualTo("4,00");
    assertThat(f1.score().explanation()).isEqualTo("CoD = 8 + 5 + 3 = 16 ; WSJF = 16 / 4 = 4,00");
  }

  @Test
  void acceptanceScenario2ChangingTheJobSizeReordersTheBoard() {
    Item f2 = item("F-2", 2, 2, 2, 3);
    assertThat(f2.score().computed().get("wsjf").display(Display.DECIMAL_2)).isEqualTo("2,00");

    assertThat(order(item("F-1", 8, 5, 3, 4), f2)).containsExactly("F-1", "F-2");

    Item f1WithJs10 = item("F-1", 8, 5, 3, 10);
    assertThat(f1WithJs10.score().computed().get("wsjf").display(Display.DECIMAL_2))
        .isEqualTo("1,60");
    assertThat(order(f1WithJs10, f2)).containsExactly("F-2", "F-1");
  }

  @Test
  void aTieOnWsjfIsBrokenByCodDescending() {
    // WSJF 2,00 pour les deux ; CoD 6 contre 12.
    Item small = item("A", 2, 2, 2, 3);
    Item big = item("B", 4, 4, 4, 6);

    assertThat(order(small, big)).containsExactly("B", "A");
  }

  @Test
  void aTieOnWsjfAndCodIsBrokenByExternalIdIgnoringCase() {
    Item b = item("b-1", 2, 2, 2, 3);
    Item a = item("A-2", 2, 2, 2, 3);
    Item c = item("C-3", 2, 2, 2, 3);

    assertThat(order(c, b, a)).containsExactly("A-2", "b-1", "C-3");
  }

  @Test
  void incompleteFeaturesComeLastSortedByExternalId() {
    Item complete = item("Z-9", 1, 1, 1, 10);
    Item missingJs = item("B-2", 9, 9, 9, null);
    Item empty = item("A-1", null, null, null, null);

    assertThat(order(missingJs, complete, empty)).containsExactly("Z-9", "A-1", "B-2");
  }

  @Test
  void anOutOfScaleFeatureIsTreatedAsIncomplete() {
    Item outOfScale = item("A-1", 11, 5, 5, 1);
    Item inScale = item("B-2", 1, 1, 1, 10);

    assertThat(outOfScale.score().complete()).isFalse();
    assertThat(outOfScale.score().outOfScale()).containsExactly("bv");
    assertThat(order(outOfScale, inScale)).containsExactly("B-2", "A-1");
  }

  @Test
  void ranksArePositionsFrom1() {
    List<Ranking.Ranked<Item>> ranked =
        Ranking.rank(
            WSJF,
            List.of(
                item("B", 1, 1, 1, 10), item("A", 9, 9, 9, 1), item("C", null, null, null, null)),
            Item::id,
            Item::score);

    assertThat(ranked).extracting(Ranking.Ranked::rank).containsExactly(1, 2, 3);
    assertThat(ranked).extracting(r -> r.item().id()).containsExactly("A", "B", "C");
  }

  @Test
  void anEmptyBoardHasNoRanking() {
    assertThat(Ranking.rank(WSJF, List.<Item>of(), Item::id, Item::score)).isEmpty();
  }

  @Test
  void wsjfIsRoundedHalfUpToTwoDecimalsWithAComma() {
    // CoD 10 / JS 8 = 1,25.
    assertThat(item("A", 8, 1, 1, 8).score().computed().get("wsjf").display(Display.DECIMAL_2))
        .isEqualTo("1,25");
    // 7 / 8 = 0,875 -> 0,88 ; 1 / 3 -> 0,33 ; 5 / 6 -> 0,83 ; 0 -> 0,00.
    assertThat(Fraction.of(7, 8).display(Display.DECIMAL_2)).isEqualTo("0,88");
    assertThat(Fraction.of(1, 3).display(Display.DECIMAL_2)).isEqualTo("0,33");
    assertThat(Fraction.of(5, 6).display(Display.DECIMAL_2)).isEqualTo("0,83");
    assertThat(Fraction.of(0, 5).display(Display.DECIMAL_2)).isEqualTo("0,00");
    assertThat(Fraction.of(5, 2).display(Display.INTEGER)).isEqualTo("3");
  }
}
