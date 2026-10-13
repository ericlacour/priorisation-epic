package com.priorisationepic.domain.method;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * La méthode WSJF, version 1 : CoD = BV + TC + RR/OE, WSJF = CoD / JS. C'est la seule classe du
 * back qui connaît BV, TC, RR/OE, JS, CoD et WSJF (FR-017a, FR-017b).
 */
public final class WsjfMethod implements PrioritizationMethod {

  public static final String KEY = "WSJF";
  public static final int VERSION = 1;

  private static final String BV = "bv";
  private static final String TC = "tc";
  private static final String RR_OE = "rrOe";
  private static final String JS = "js";
  private static final String COD = "cod";
  private static final String WSJF = "wsjf";

  private static final MethodDefinition DEFINITION =
      new MethodDefinition(
          KEY,
          VERSION,
          "WSJF",
          List.of(
              new CriterionDefinition(
                  BV,
                  "BV",
                  "Business Value",
                  "Valeur apportée aux utilisateurs ou au business.",
                  "BV"),
              new CriterionDefinition(
                  TC,
                  "TC",
                  "Time Criticality",
                  "Importance de réaliser rapidement la fonctionnalité.",
                  "TC"),
              new CriterionDefinition(
                  RR_OE,
                  "RR/OE",
                  "Risk Reduction / Opportunity Enablement",
                  "Capacité à réduire un risque ou à permettre une opportunité.",
                  "RR/OE"),
              new CriterionDefinition(
                  JS, "JS", "Job Size", "Taille relative du travail nécessaire.", "JS")),
          List.of(
              new ComputedValueDefinition(
                  COD,
                  "CoD",
                  "Cost of Delay",
                  "Coût du retard : BV + TC + RR/OE.",
                  "CoD",
                  Display.INTEGER),
              new ComputedValueDefinition(
                  WSJF,
                  "WSJF",
                  "Weighted Shortest Job First",
                  "CoD / JS ; plus il est élevé, plus la fonctionnalité est prioritaire.",
                  "WSJF",
                  Display.DECIMAL_2)),
          "CoD = BV + TC + RR/OE ; WSJF = CoD / JS",
          "WSJF décroissant, puis CoD décroissant, puis identifiant croissant (sans tenir compte de"
              + " la casse). Les fonctionnalités incomplètes ou hors échelle viennent en fin de"
              + " tableau, par identifiant croissant.");

  @Override
  public MethodDefinition definition() {
    return DEFINITION;
  }

  @Override
  public Map<String, Fraction> compute(Criteria criteria) {
    Fraction cod =
        Fraction.of(criteria.get(BV))
            .plus(Fraction.of(criteria.get(TC)))
            .plus(Fraction.of(criteria.get(RR_OE)));
    Map<String, Fraction> computed = new LinkedHashMap<>();
    computed.put(COD, cod);
    computed.put(WSJF, cod.dividedBy(Fraction.of(criteria.get(JS))));
    return computed;
  }

  @Override
  public String explain(Criteria criteria) {
    Map<String, Fraction> computed = compute(criteria);
    String cod = computed.get(COD).display(Display.INTEGER);
    String wsjf = computed.get(WSJF).display(Display.DECIMAL_2);
    return "CoD = "
        + criteria.get(BV)
        + " + "
        + criteria.get(TC)
        + " + "
        + criteria.get(RR_OE)
        + " = "
        + cod
        + " ; WSJF = "
        + cod
        + " / "
        + criteria.get(JS)
        + " = "
        + wsjf;
  }

  @Override
  public int compare(Map<String, Fraction> a, Map<String, Fraction> b) {
    int byWsjf = b.get(WSJF).compareTo(a.get(WSJF));
    return byWsjf != 0 ? byWsjf : b.get(COD).compareTo(a.get(COD));
  }
}
