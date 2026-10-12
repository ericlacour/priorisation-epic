package com.priorisationepic.domain.method;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.scale.Scale;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.jqwik.api.Arbitraries;
import net.jqwik.api.Arbitrary;
import net.jqwik.api.Combinators;
import net.jqwik.api.ForAll;
import net.jqwik.api.Property;
import net.jqwik.api.Provide;

class WsjfMethodPropertiesTest {

  private static final WsjfMethod WSJF = new WsjfMethod();
  private static final SessionId SESSION = new SessionId("c".repeat(22));

  private static Criteria criteria(Integer bv, Integer tc, Integer rrOe, Integer js) {
    Map<String, Integer> values = new HashMap<>();
    values.put("bv", bv);
    values.put("tc", tc);
    values.put("rrOe", rrOe);
    values.put("js", js);
    return new Criteria(WSJF.definition(), values);
  }

  @Provide
  Arbitrary<Integer> values() {
    return Arbitraries.integers().between(1, 100);
  }

  @Provide
  Arbitrary<Integer> maybeValues() {
    return Arbitraries.integers().between(1, 100).injectNull(0.2);
  }

  @Provide
  Arbitrary<List<Feature>> featureLists() {
    return features().list().ofMaxSize(15);
  }

  Arbitrary<Feature> features() {
    Arbitrary<String> ids = Arbitraries.strings().alpha().ofMinLength(1).ofMaxLength(4);
    Arbitrary<Integer> v = Arbitraries.integers().between(1, 12).injectNull(0.1);
    return Combinators.combine(ids, v, v, v, v)
        .as(
            (id, bv, tc, rr, js) ->
                Feature.create(
                    UUID.randomUUID(),
                    SESSION,
                    id,
                    "t",
                    null,
                    criteria(bv, tc, rr, js),
                    Scale.continuous(100)));
  }

  @Property
  void codIsTheSumAndWsjfIsTheExactQuotient(
      @ForAll("values") int bv,
      @ForAll("values") int tc,
      @ForAll("values") int rr,
      @ForAll("values") int js) {
    Map<String, Fraction> computed = WSJF.compute(criteria(bv, tc, rr, js)).orElseThrow();
    assertThat(computed.get("cod")).isEqualTo(Fraction.of(bv + tc + rr));
    assertThat(computed.get("wsjf")).isEqualTo(Fraction.of(bv + tc + rr, js));
    assertThat(computed.get("wsjf").numerator().multiply(BigInteger.valueOf(js)))
        .isEqualTo(BigInteger.valueOf(bv + tc + rr).multiply(computed.get("wsjf").denominator()));
  }

  @Property
  void displayIsHalfUpWithCommaAndTwoDecimals(
      @ForAll("values") int bv,
      @ForAll("values") int tc,
      @ForAll("values") int rr,
      @ForAll("values") int js) {
    Fraction wsjf = WSJF.compute(criteria(bv, tc, rr, js)).orElseThrow().get("wsjf");
    String expected =
        new BigDecimal(bv + tc + rr)
            .divide(new BigDecimal(js), 2, RoundingMode.HALF_UP)
            .toPlainString()
            .replace('.', ',');
    assertThat(wsjf.format(Display.DECIMAL_2)).isEqualTo(expected);
  }

  @Property
  void crossProductComparisonEqualsExactValueComparison(
      @ForAll("values") int n1,
      @ForAll("values") int d1,
      @ForAll("values") int n2,
      @ForAll("values") int d2) {
    int byCrossProduct = Long.compare((long) n1 * d2, (long) n2 * d1);
    BigDecimal a = new BigDecimal(n1).divide(new BigDecimal(d1), 60, RoundingMode.HALF_EVEN);
    BigDecimal b = new BigDecimal(n2).divide(new BigDecimal(d2), 60, RoundingMode.HALF_EVEN);
    assertThat(Fraction.of(n1, d1).compareTo(Fraction.of(n2, d2)))
        .isEqualTo(byCrossProduct)
        .isEqualTo(a.compareTo(b));
  }

  @Property
  void neverComputedWhenACriterionIsMissing(
      @ForAll("maybeValues") Integer bv,
      @ForAll("maybeValues") Integer tc,
      @ForAll("maybeValues") Integer rr,
      @ForAll("maybeValues") Integer js) {
    Criteria criteria = criteria(bv, tc, rr, js);
    boolean allSet = bv != null && tc != null && rr != null && js != null;
    assertThat(WSJF.compute(criteria).isPresent()).isEqualTo(allSet);
    assertThat(Score.of(WSJF, criteria, Scale.continuous(100)).complete()).isEqualTo(allSet);
  }

  @Property
  void neverComputedWhenAValueIsOutOfScale(
      @ForAll("values") int bv,
      @ForAll("values") int tc,
      @ForAll("values") int rr,
      @ForAll("values") int js) {
    Scale scale = Scale.continuous(50);
    Score score = Score.of(WSJF, criteria(bv, tc, rr, js), scale);
    boolean inScale = bv <= 50 && tc <= 50 && rr <= 50 && js <= 50;
    assertThat(score.complete()).isEqualTo(inScale);
    assertThat(score.computed().isEmpty()).isEqualTo(!inScale);
    assertThat(score.outOfScale().isEmpty()).isEqualTo(inScale);
  }

  @Property
  void rankingIsTotalStableAndPermutationInvariant(
      @ForAll("featureLists") List<Feature> input, @ForAll long seed) {
    List<Feature> unique = new ArrayList<>();
    java.util.Set<String> seen = new java.util.HashSet<>();
    for (Feature f : input) {
      if (seen.add(f.externalKey())) {
        unique.add(f);
      }
    }
    Scale scale = Scale.continuous(100);
    List<RankedFeature> ranked = Ranking.rank(WSJF, scale, unique);
    List<Feature> shuffled = new ArrayList<>(unique);
    java.util.Collections.shuffle(shuffled, new java.util.Random(seed));
    List<RankedFeature> again = Ranking.rank(WSJF, scale, shuffled);

    assertThat(ranked).hasSameSizeAs(unique);
    assertThat(again.stream().map(r -> r.feature().id()).toList())
        .isEqualTo(ranked.stream().map(r -> r.feature().id()).toList());
    for (int i = 0; i < ranked.size(); i++) {
      assertThat(ranked.get(i).score().rank()).isEqualTo(i + 1);
    }
    for (int i = 1; i < ranked.size(); i++) {
      assertThat(before(ranked.get(i - 1), ranked.get(i))).isTrue();
    }
  }

  private static boolean before(RankedFeature a, RankedFeature b) {
    if (a.score().complete() != b.score().complete()) {
      return a.score().complete();
    }
    if (a.score().complete()) {
      int byMethod = WSJF.compare(a.score().exact(), b.score().exact());
      if (byMethod != 0) {
        return byMethod < 0;
      }
    }
    return a.feature().externalKey().compareTo(b.feature().externalKey()) < 0;
  }
}
