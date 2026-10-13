package com.priorisationepic.domain.method;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.domain.scale.Scale;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import net.jqwik.api.Arbitraries;
import net.jqwik.api.Arbitrary;
import net.jqwik.api.Combinators;
import net.jqwik.api.ForAll;
import net.jqwik.api.Property;
import net.jqwik.api.Provide;

/** Propriétés du calcul, du tri et de la comparaison du WSJF (constitution II). */
class WsjfMethodPropertiesTest {

  private static final WsjfMethod WSJF = new WsjfMethod();
  private static final Scale SCALE = Scale.defaultScale();

  /** Valeurs complètes dans l'échelle 1 à 10. */
  record Values(int bv, int tc, int rrOe, int js) {
    Criteria criteria() {
      return Criteria.of(WSJF.definition(), Map.of("bv", bv, "tc", tc, "rrOe", rrOe, "js", js));
    }
  }

  record Row(String id, Criteria criteria) {
    Score score() {
      return Score.of(WSJF, criteria, SCALE);
    }
  }

  @Provide
  Arbitrary<Values> values() {
    Arbitrary<Integer> value = Arbitraries.integers().between(1, 10);
    return Combinators.combine(value, value, value, value).as(Values::new);
  }

  @Provide
  Arbitrary<Row> rows() {
    Arbitrary<String> id = Arbitraries.strings().withCharRange('a', 'e').ofLength(2);
    Arbitrary<Integer> value = Arbitraries.integers().between(1, 10).injectNull(0.25);
    return Combinators.combine(id, value, value, value, value)
        .as(
            (i, bv, tc, rrOe, js) -> {
              Map<String, Integer> entered = new HashMap<>();
              if (bv != null) entered.put("bv", bv);
              if (tc != null) entered.put("tc", tc);
              if (rrOe != null) entered.put("rrOe", rrOe);
              if (js != null) entered.put("js", js);
              return new Row(i, Criteria.of(WSJF.definition(), entered));
            });
  }

  @Property
  void codIsTheSumOfTheThreeBenefits(@ForAll("values") Values v) {
    Map<String, Fraction> computed = WSJF.compute(v.criteria());

    assertThat(computed.get("cod")).isEqualTo(Fraction.of(v.bv + v.tc + v.rrOe));
  }

  @Property
  void wsjfIsCodDividedByJobSizeAsAnExactFraction(@ForAll("values") Values v) {
    Fraction wsjf = WSJF.compute(v.criteria()).get("wsjf");
    long cod = v.bv + v.tc + v.rrOe;

    // wsjf * js == cod : aucune perte, contrairement à un flottant.
    assertThat(wsjf.numerator() * v.js).isEqualTo(cod * wsjf.denominator());
    assertThat(wsjf.denominator()).isPositive();
  }

  @Property
  void crossProductComparisonEqualsExactValueComparison(
      @ForAll("values") Values a, @ForAll("values") Values b) {
    Fraction fa = WSJF.compute(a.criteria()).get("wsjf");
    Fraction fb = WSJF.compute(b.criteria()).get("wsjf");
    BigInteger left =
        BigInteger.valueOf(fa.numerator()).multiply(BigInteger.valueOf(fb.denominator()));
    BigInteger right =
        BigInteger.valueOf(fb.numerator()).multiply(BigInteger.valueOf(fa.denominator()));

    assertThat(Integer.signum(fa.compareTo(fb))).isEqualTo(Integer.signum(left.compareTo(right)));
    assertThat(Integer.signum(fa.compareTo(fb))).isEqualTo(-Integer.signum(fb.compareTo(fa)));
  }

  @Property
  void wsjfIsNeverComputedWhenACriterionIsMissingOrOutOfScale(
      @ForAll("rows") Row row,
      @ForAll @net.jqwik.api.constraints.IntRange(min = 11, max = 40) int tooBig) {
    Score score = row.score();
    boolean allEntered = row.criteria().keys().size() == 4;

    assertThat(score.complete()).isEqualTo(allEntered);
    if (!score.complete()) {
      assertThat(score.computed()).isNull();
      assertThat(score.explanation()).isNull();
    }
    Criteria outOfScale =
        Criteria.of(WSJF.definition(), Map.of("bv", tooBig, "tc", 1, "rrOe", 1, "js", 1));
    Score refused = Score.of(WSJF, outOfScale, SCALE);
    assertThat(refused.complete()).isFalse();
    assertThat(refused.outOfScale()).containsExactly("bv");
    assertThat(refused.computed()).isNull();
  }

  @Provide
  Arbitrary<List<Row>> rowLists() {
    return rows().list().ofMaxSize(12);
  }

  @Property
  void theRankingIsTotalStableAndOrderedByTheDocumentedRule(@ForAll("rowLists") List<Row> rows) {
    List<Row> distinct = new ArrayList<>();
    for (Row row : rows) {
      if (distinct.stream().noneMatch(r -> r.id().equals(row.id()))) {
        distinct.add(row);
      }
    }
    List<Ranking.Ranked<Row>> ranked = Ranking.rank(WSJF, distinct, Row::id, Row::score);

    assertThat(ranked).hasSameSizeAs(distinct);
    assertThat(ranked)
        .extracting(Ranking.Ranked::rank)
        .containsExactlyElementsOf(
            java.util.stream.IntStream.rangeClosed(1, distinct.size()).boxed().toList());
    for (int i = 0; i + 1 < ranked.size(); i++) {
      Row before = ranked.get(i).item();
      Row after = ranked.get(i + 1).item();
      Score sb = before.score();
      Score sa = after.score();
      if (sb.complete() && sa.complete()) {
        int byMethod = WSJF.compare(sb.computed(), sa.computed());
        assertThat(byMethod).isLessThanOrEqualTo(0);
        if (byMethod == 0) {
          assertThat(before.id().toLowerCase(Locale.ROOT))
              .isLessThanOrEqualTo(after.id().toLowerCase(Locale.ROOT));
        }
      } else {
        assertThat(sb.complete() && !sa.complete() || !sb.complete() && !sa.complete()).isTrue();
        if (!sb.complete()) {
          assertThat(before.id().toLowerCase(Locale.ROOT))
              .isLessThanOrEqualTo(after.id().toLowerCase(Locale.ROOT));
        }
      }
    }
    // Stabilité et déterminisme : le même tri, quel que soit l'ordre d'entrée.
    List<Row> reversed = new ArrayList<>(distinct);
    java.util.Collections.reverse(reversed);
    assertThat(
            Ranking.rank(WSJF, reversed, Row::id, Row::score).stream()
                .map(r -> r.item().id())
                .toList())
        .isEqualTo(ranked.stream().map(r -> r.item().id()).toList());
  }
}
