package com.priorisationepic.adapter.out.io;

import static com.priorisationepic.adapter.out.io.ExportFixtures.FAKE;

import com.priorisationepic.application.ImportPreview;
import com.priorisationepic.application.SessionStateView;
import com.priorisationepic.application.SessionStateView.ScoreView;
import com.priorisationepic.domain.method.CriterionDefinition;
import com.priorisationepic.domain.method.PrioritizationMethod;
import com.priorisationepic.domain.method.WsjfMethod;
import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.domain.scale.ScaleType;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import net.jqwik.api.Arbitraries;
import net.jqwik.api.Arbitrary;
import net.jqwik.api.Combinators;

/**
 * Sessions générées pour les tests d'aller-retour (constitution VI) : méthode (WSJF v1, WSJF v2 ou
 * la méthode fictive), échelle, et jusqu'à 12 fonctionnalités aux textes piégeux (séparateurs,
 * guillemets, accents, sauts de ligne, caractères wiki), avec des critères parfois absents.
 */
final class ExportArbitraries {

  private ExportArbitraries() {}

  /** Une session générée. */
  record Generated(PrioritizationMethod method, Scale scale, List<ExportFixtures.Row> rows) {}

  /** Ce qui doit survivre à l'aller-retour : les données de priorisation et les scores. */
  record Prioritized(
      String externalId,
      String title,
      String description,
      Map<String, Integer> criteria,
      ScoreView score) {}

  static Arbitrary<Generated> sessions() {
    Arbitrary<PrioritizationMethod> methods =
        Arbitraries.of(WsjfMethod.version1(), WsjfMethod.version2(), FAKE);
    return methods.flatMap(
        method ->
            scales()
                .flatMap(
                    scale -> rows(method, scale).map(rows -> new Generated(method, scale, rows))));
  }

  static Arbitrary<Scale> scales() {
    Arbitrary<Scale> continuous =
        Arbitraries.integers()
            .between(Scale.MIN_MAX, Scale.MAX_MAX)
            .map(max -> new Scale(ScaleType.CONTINUOUS, max));
    Arbitrary<Scale> fibonacci =
        Arbitraries.of(Scale.FIBONACCI_BOUNDS).map(max -> new Scale(ScaleType.FIBONACCI, max));
    return Arbitraries.oneOf(continuous, fibonacci);
  }

  private static Arbitrary<List<ExportFixtures.Row>> rows(
      PrioritizationMethod method, Scale scale) {
    // = + - @ et ' en tête de texte : la protection contre les formules doit rester réversible.
    Arbitrary<String> ids = text("abcxyzABC0123-_.;,é\"'=+@ ", 12);
    Arbitrary<String> titles = text("abcdeéèàçÉ ;,\"'|{}[]=+-@«»", 40);
    Arbitrary<String> descriptions = text("abc éà;,\"'|{}[]=+-@\n", 80).injectNull(0.3);
    Arbitrary<String> reviews = Arbitraries.just("à compléter").injectNull(0.7);
    Arbitrary<ExportFixtures.Row> row =
        Combinators.combine(ids, titles, descriptions, criteria(method, scale), reviews)
            .as(ExportFixtures.Row::new);
    return row.list().ofMaxSize(12).uniqueElements(r -> r.externalId().toLowerCase(Locale.ROOT));
  }

  /** Un texte sans espace aux extrémités et non vide, comme après la saisie ou l'import. */
  private static Arbitrary<String> text(String chars, int maxLength) {
    return Arbitraries.strings()
        .withChars(chars)
        .ofMinLength(1)
        .ofMaxLength(maxLength)
        .map(String::strip)
        .filter(text -> !text.isEmpty());
  }

  private static Arbitrary<Map<String, Integer>> criteria(
      PrioritizationMethod method, Scale scale) {
    List<CriterionDefinition> criteria = method.definition().criteria();
    return Arbitraries.of(scale.allowedValues())
        .injectNull(0.2)
        .list()
        .ofSize(criteria.size())
        .map(
            values -> {
              Map<String, Integer> map = new LinkedHashMap<>();
              for (int i = 0; i < criteria.size(); i++) {
                if (values.get(i) != null) {
                  map.put(criteria.get(i).key(), values.get(i));
                }
              }
              return map;
            });
  }

  /** Les lignes valides d'un aperçu d'import, comme fonctionnalités à créer. */
  static List<ExportFixtures.Row> rows(ImportPreview preview) {
    return preview.validRows().stream()
        .map(
            row ->
                new ExportFixtures.Row(
                    row.externalId(), row.title(), row.description(), row.criteria(), null))
        .toList();
  }

  /** Le tableau, dans son ordre, réduit aux données de priorisation et aux scores. */
  static List<Prioritized> prioritized(SessionStateView state) {
    return state.features().stream()
        .map(
            feature ->
                new Prioritized(
                    feature.externalId(),
                    feature.title(),
                    feature.description(),
                    feature.criteria(),
                    feature.score()))
        .toList();
  }
}
