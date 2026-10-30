package com.priorisationepic.domain.method;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * La méthode WSJF : CoD = BV + TC + RR/OE, WSJF = CoD / JS. C'est la seule classe du back qui
 * connaît BV, TC, RR/OE, JS, CoD et WSJF (FR-017a, FR-017b).
 *
 * <ul>
 *   <li>Version 1 : les quatre critères sont nécessaires au calcul.
 *   <li>Version 2 : le JS et au moins un critère parmi BV, TC et RR/OE suffisent ; un critère du
 *       CoD sans valeur compte 0, et le détail du calcul le dit (FR-012).
 * </ul>
 *
 * Une session garde la version choisie à sa création : la version 1 reste connue pour les sessions
 * qui l'utilisent, la version 2 est proposée aux nouvelles.
 */
public final class WsjfMethod implements PrioritizationMethod {

  public static final String KEY = "WSJF";

  private static final String BV = "bv";
  private static final String TC = "tc";
  private static final String RR_OE = "rrOe";
  private static final String JS = "js";
  private static final String COD = "cod";
  private static final String WSJF = "wsjf";
  private static final List<String> BENEFITS = List.of(BV, TC, RR_OE);

  private static final List<CriterionDefinition> CRITERIA =
      List.of(
          new CriterionDefinition(
              BV, "BV", "Business Value", "Valeur apportée aux utilisateurs ou au business.", "BV"),
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
              JS,
              "JS",
              "Job Size",
              "Taille relative du travail nécessaire : plus le JS est grand, plus le travail est long"
                  + " et compliqué, et plus le WSJF baisse.",
              "JS"));

  private static final ComputedValueDefinition WSJF_VALUE =
      new ComputedValueDefinition(
          WSJF,
          "WSJF",
          "Weighted Shortest Job First",
          "CoD / JS ; plus il est élevé, plus la fonctionnalité est prioritaire.",
          "WSJF",
          Display.DECIMAL_2);

  private static final String TIE_BREAK =
      "WSJF décroissant, puis CoD décroissant, puis identifiant croissant (sans tenir compte de"
          + " la casse). ";

  private static final MethodDefinition VERSION_1 =
      new MethodDefinition(
          KEY,
          1,
          "WSJF",
          CRITERIA,
          List.of(
              new ComputedValueDefinition(
                  COD,
                  "CoD",
                  "Cost of Delay",
                  "Coût du retard : BV + TC + RR/OE.",
                  "CoD",
                  Display.INTEGER),
              WSJF_VALUE),
          "CoD = BV + TC + RR/OE ; WSJF = CoD / JS",
          TIE_BREAK
              + "Les fonctionnalités incomplètes ou hors échelle viennent en fin de tableau, par"
              + " identifiant croissant.");

  private static final MethodDefinition VERSION_2 =
      new MethodDefinition(
          KEY,
          2,
          "WSJF",
          CRITERIA,
          List.of(
              new ComputedValueDefinition(
                  COD,
                  "CoD",
                  "Cost of Delay",
                  "Coût du retard : BV + TC + RR/OE ; un critère sans valeur compte 0.",
                  "CoD",
                  Display.INTEGER),
              WSJF_VALUE),
          "CoD = BV + TC + RR/OE (un critère sans valeur compte 0) ; WSJF = CoD / JS. Il faut le"
              + " JS et au moins un critère parmi BV, TC et RR/OE.",
          TIE_BREAK
              + "Les fonctionnalités sans JS, sans aucun de BV, TC et RR/OE, ou hors échelle"
              + " viennent en fin de tableau, par identifiant croissant.");

  private final MethodDefinition definition;

  /** Le JS et au moins un critère du CoD suffisent au calcul (version 2) ; sinon, les quatre. */
  private final boolean partialBenefits;

  private WsjfMethod(MethodDefinition definition, boolean partialBenefits) {
    this.definition = definition;
    this.partialBenefits = partialBenefits;
  }

  /** WSJF version 1 : les quatre critères sont nécessaires. */
  public static WsjfMethod version1() {
    return new WsjfMethod(VERSION_1, false);
  }

  /** WSJF version 2 : le JS et au moins un critère du CoD suffisent. */
  public static WsjfMethod version2() {
    return new WsjfMethod(VERSION_2, true);
  }

  @Override
  public MethodDefinition definition() {
    return definition;
  }

  @Override
  public boolean computable(Criteria criteria) {
    if (!partialBenefits) {
      return PrioritizationMethod.super.computable(criteria);
    }
    return criteria.isEntered(JS) && BENEFITS.stream().anyMatch(criteria::isEntered);
  }

  @Override
  public Map<String, Fraction> compute(Criteria criteria) {
    Fraction cod = Fraction.of(0);
    for (String benefit : BENEFITS) {
      cod = cod.plus(Fraction.of(valueOrZero(criteria, benefit)));
    }
    Map<String, Fraction> computed = new LinkedHashMap<>();
    computed.put(COD, cod);
    computed.put(WSJF, cod.dividedBy(Fraction.of(criteria.get(JS))));
    return computed;
  }

  private static int valueOrZero(Criteria criteria, String key) {
    Integer value = criteria.get(key);
    return value == null ? 0 : value;
  }

  /**
   * « CoD = 8 + 5 + 3 = 16 ; WSJF = 16 / 4 = 4,00 ». Un critère sans valeur s'écrit 0 et il est
   * nommé : « CoD = 8 + 0 + 3 = 11 (TC sans valeur, compté 0) ; … ».
   */
  @Override
  public String explain(Criteria criteria) {
    Map<String, Fraction> computed = compute(criteria);
    String cod = computed.get(COD).display(Display.INTEGER);
    String wsjf = computed.get(WSJF).display(Display.DECIMAL_2);
    List<String> terms = new ArrayList<>();
    List<String> missing = new ArrayList<>();
    for (String benefit : BENEFITS) {
      terms.add(String.valueOf(valueOrZero(criteria, benefit)));
      if (!criteria.isEntered(benefit)) {
        missing.add(codeOf(benefit));
      }
    }
    return "CoD = "
        + String.join(" + ", terms)
        + " = "
        + cod
        + missingNote(missing)
        + " ; WSJF = "
        + cod
        + " / "
        + criteria.get(JS)
        + " = "
        + wsjf;
  }

  private String codeOf(String key) {
    return definition.criterion(key).orElseThrow().code();
  }

  private static String missingNote(List<String> missing) {
    if (missing.isEmpty()) {
      return "";
    }
    if (missing.size() == 1) {
      return " (" + missing.get(0) + " sans valeur, compté 0)";
    }
    String last = missing.get(missing.size() - 1);
    String others = String.join(", ", missing.subList(0, missing.size() - 1));
    return " (" + others + " et " + last + " sans valeur, comptés 0)";
  }

  @Override
  public int compare(Map<String, Fraction> a, Map<String, Fraction> b) {
    int byWsjf = b.get(WSJF).compareTo(a.get(WSJF));
    return byWsjf != 0 ? byWsjf : b.get(COD).compareTo(a.get(COD));
  }
}
