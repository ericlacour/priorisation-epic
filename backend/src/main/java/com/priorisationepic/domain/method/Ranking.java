package com.priorisationepic.domain.method;

import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.scale.Scale;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;

/**
 * Tri générique (FR-014) : fonctionnalités complètes d'abord, dans l'ordre de {@link
 * PrioritizationMethod#compare}, puis par identifiant sans tenir compte de la casse ; ensuite les
 * incomplètes ou hors échelle, par identifiant. Les fonctionnalités supprimées sont ignorées.
 */
public final class Ranking {

  private Ranking() {}

  public static List<RankedFeature> rank(
      PrioritizationMethod method, Scale scale, Collection<Feature> features) {
    List<RankedFeature> items = new ArrayList<>();
    for (Feature feature : features) {
      if (!feature.isDeleted()) {
        items.add(new RankedFeature(feature, feature.score(method, scale)));
      }
    }
    Comparator<RankedFeature> byId =
        Comparator.comparing((RankedFeature r) -> r.feature().externalKey())
            .thenComparing(r -> r.feature().externalId())
            .thenComparing(r -> r.feature().id());
    Comparator<RankedFeature> order =
        (a, b) -> {
          boolean ac = a.score().complete();
          if (ac != b.score().complete()) {
            return ac ? -1 : 1;
          }
          if (ac) {
            int byMethod = method.compare(a.score().exact(), b.score().exact());
            if (byMethod != 0) {
              return byMethod;
            }
          }
          return byId.compare(a, b);
        };
    items.sort(order);
    List<RankedFeature> ranked = new ArrayList<>(items.size());
    for (int i = 0; i < items.size(); i++) {
      RankedFeature item = items.get(i);
      ranked.add(new RankedFeature(item.feature(), item.score().withRank(i + 1)));
    }
    return List.copyOf(ranked);
  }
}
