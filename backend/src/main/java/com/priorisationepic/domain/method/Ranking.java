package com.priorisationepic.domain.method;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.function.Function;

/**
 * Tri du tableau (FR-014), générique : les fonctionnalités complètes d'abord, dans l'ordre de
 * {@link PrioritizationMethod#compare}, puis par identifiant croissant sans tenir compte de la
 * casse ; viennent ensuite les incomplètes et les hors échelle, par identifiant croissant. Le tri
 * est total et stable. Le rang est la position dans cet ordre, à partir de 1.
 */
public final class Ranking {

  private Ranking() {}

  /** Un élément trié et son rang. */
  public record Ranked<T>(T item, int rank) {}

  public static <T> List<Ranked<T>> rank(
      PrioritizationMethod method,
      List<T> items,
      Function<T, String> externalId,
      Function<T, Score> score) {
    Comparator<T> byId =
        Comparator.comparing((T item) -> externalId.apply(item).toLowerCase(Locale.ROOT))
            .thenComparing(externalId);
    Comparator<T> order =
        (a, b) -> {
          Score sa = score.apply(a);
          Score sb = score.apply(b);
          if (sa.complete() != sb.complete()) {
            return sa.complete() ? -1 : 1;
          }
          if (sa.complete()) {
            int byMethod = method.compare(sa.computed(), sb.computed());
            if (byMethod != 0) {
              return byMethod;
            }
          }
          return byId.compare(a, b);
        };
    List<T> sorted = new ArrayList<>(items);
    sorted.sort(order);
    List<Ranked<T>> ranked = new ArrayList<>(sorted.size());
    for (int i = 0; i < sorted.size(); i++) {
      ranked.add(new Ranked<>(sorted.get(i), i + 1));
    }
    return ranked;
  }
}
