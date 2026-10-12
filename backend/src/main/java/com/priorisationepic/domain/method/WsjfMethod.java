package com.priorisationepic.domain.method;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Méthode WSJF, version 1. C'est la seule classe du back qui connaît BV, TC, RR/OE, JS, CoD et WSJF
 * : CoD = BV + TC + RR/OE, WSJF = CoD / JS.
 */
public final class WsjfMethod implements PrioritizationMethod {

  public static final String KEY = "WSJF";
  public static final int VERSION = 1;

  private static final MethodDefinition DEFINITION =
      new MethodDefinition(
          KEY,
          VERSION,
          "WSJF",
          List.of(
              new CriterionDefinition(
                  "bv",
                  "BV",
                  "Business Value",
                  "Valeur apportée aux utilisateurs ou au business.",
                  "BV"),
              new CriterionDefinition(
                  "tc",
                  "TC",
                  "Time Criticality",
                  "Importance de réaliser rapidement la fonctionnalité.",
                  "TC"),
              new CriterionDefinition(
                  "rrOe",
                  "RR/OE",
                  "Risk Reduction / Opportunity Enablement",
                  "Capacité à réduire un risque ou à permettre une opportunité.",
                  "RR/OE"),
              new CriterionDefinition(
                  "js", "JS", "Job Size", "Taille relative du travail nécessaire.", "JS")),
          List.of(
              new ComputedValueDefinition(
                  "cod",
                  "CoD",
                  "Cost of Delay",
                  "Coût du retard : BV + TC + RR/OE.",
                  "CoD",
                  Display.INTEGER),
              new ComputedValueDefinition(
                  "wsjf",
                  "WSJF",
                  "Weighted Shortest Job First",
                  "CoD / JS. Plus il est élevé, plus la fonctionnalité est prioritaire.",
                  "WSJF",
                  Display.DECIMAL_2)),
          "CoD = BV + TC + RR/OE ; WSJF = CoD / JS",
          "Tri par WSJF décroissant. À WSJF égal, le CoD le plus élevé passe devant. À CoD égal,"
              + " l'ordre alphabétique de l'identifiant départage, sans tenir compte de la casse."
              + " Les fonctionnalités incomplètes ou hors échelle sont en fin de tableau, triées"
              + " par identifiant.");

  @Override
  public MethodDefinition definition() {
    return DEFINITION;
  }

  @Override
  public Optional<Map<String, Fraction>> compute(Criteria criteria) {
    var bv = criteria.value("bv");
    var tc = criteria.value("tc");
    var rrOe = criteria.value("rrOe");
    var js = criteria.value("js");
    if (bv.isEmpty() || tc.isEmpty() || rrOe.isEmpty() || js.isEmpty()) {
      return Optional.empty();
    }
    long cod = (long) bv.getAsInt() + tc.getAsInt() + rrOe.getAsInt();
    Map<String, Fraction> computed = new LinkedHashMap<>();
    computed.put("cod", Fraction.of(cod));
    computed.put("wsjf", Fraction.of(cod, js.getAsInt()));
    return Optional.of(computed);
  }

  @Override
  public String explain(Criteria criteria) {
    Map<String, Fraction> computed =
        compute(criteria).orElseThrow(() -> new IllegalArgumentException("Critères incomplets"));
    return "CoD = "
        + criteria.value("bv").getAsInt()
        + " + "
        + criteria.value("tc").getAsInt()
        + " + "
        + criteria.value("rrOe").getAsInt()
        + " = "
        + computed.get("cod").format(Display.INTEGER)
        + " ; WSJF = "
        + computed.get("cod").format(Display.INTEGER)
        + " / "
        + criteria.value("js").getAsInt()
        + " = "
        + computed.get("wsjf").format(Display.DECIMAL_2);
  }

  @Override
  public int compare(Map<String, Fraction> a, Map<String, Fraction> b) {
    int byWsjf = b.get("wsjf").compareTo(a.get("wsjf"));
    return byWsjf != 0 ? byWsjf : b.get("cod").compareTo(a.get("cod"));
  }
}
