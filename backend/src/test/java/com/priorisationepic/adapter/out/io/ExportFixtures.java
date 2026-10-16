package com.priorisationepic.adapter.out.io;

import com.priorisationepic.application.InMemoryStore;
import com.priorisationepic.application.RecordingBroadcaster;
import com.priorisationepic.application.SessionStateAssembler;
import com.priorisationepic.application.SessionStateView;
import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.method.Criteria;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.method.PrioritizationMethod;
import com.priorisationepic.domain.method.WsjfMethod;
import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.testmethod.FakeTwoCriteriaMethod;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Vues de session pour les tests des exports, construites comme en production par {@link
 * SessionStateAssembler} : les fonctionnalités sont triées et leurs scores calculés par le domaine.
 */
final class ExportFixtures {

  static final SessionId SESSION_ID = new SessionId("k3Jx9QvT2mLpZ8wR4nYb7A");
  static final FakeTwoCriteriaMethod FAKE = new FakeTwoCriteriaMethod();
  static final MethodRegistry METHODS =
      new MethodRegistry(List.of(WsjfMethod.version1(), WsjfMethod.version2(), FAKE));

  /** Le 15/10/2026 à 22 h 30 UTC, soit le 16/10/2026 à Paris. */
  static final Instant EXPORTED_AT = Instant.parse("2026-10-15T22:30:00Z");

  private ExportFixtures() {}

  /** Une fonctionnalité à créer : valeurs par clé de critère, marque « à revoir » éventuelle. */
  record Row(
      String externalId,
      String title,
      String description,
      Map<String, Integer> criteria,
      String reviewReason) {

    Row review(String reason) {
      return new Row(externalId, title, description, criteria, reason);
    }
  }

  static Row row(String externalId, String title, String description, Integer... values) {
    return new Row(externalId, title, description, wsjf(values), null);
  }

  /** Valeurs WSJF dans l'ordre BV, TC, RR/OE, JS ; {@code null} : non renseigné. */
  static Map<String, Integer> wsjf(Integer... values) {
    List<String> keys = List.of("bv", "tc", "rrOe", "js");
    Map<String, Integer> criteria = new LinkedHashMap<>();
    for (int i = 0; i < values.length; i++) {
      if (values[i] != null) {
        criteria.put(keys.get(i), values[i]);
      }
    }
    return criteria;
  }

  /** Le tableau de démonstration en WSJF v1, échelle 1 à 10. */
  static SessionStateView wsjfBoard() {
    return state(
        WsjfMethod.version1(),
        Scale.defaultScale(),
        "PI 27 – Epics",
        List.of(
            row("F-2", "Paiement", null, 2, 2, 2, 3).review("descriptif à compléter"),
            row("F-1", "Recherche | filtres", "Ligne 1\nLigne 2 ; « citée »", 8, 5, 3, 4),
            row("F-3", "Incomplète", "", 6)));
  }

  static SessionStateView state(
      PrioritizationMethod method, Scale scale, String name, List<Row> rows) {
    InMemoryStore store = new InMemoryStore();
    store.insert(
        Session.create(SESSION_ID, name, method, scale, Pseudo.of("Alice"), EXPORTED_AT), "hash");
    for (Row row : rows) {
      Feature feature =
          Feature.create(
              UUID.randomUUID(),
              SESSION_ID,
              row.externalId(),
              row.title(),
              row.description(),
              Criteria.of(method.definition(), row.criteria()));
      store.insert(
          row.reviewReason() == null ? feature : feature.markForReview(row.reviewReason()));
    }
    return new SessionStateAssembler(store, store, store, METHODS, new RecordingBroadcaster())
        .readOnlyView(SESSION_ID)
        .orElseThrow();
  }
}
