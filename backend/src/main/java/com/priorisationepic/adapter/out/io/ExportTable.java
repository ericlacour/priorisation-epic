package com.priorisationepic.adapter.out.io;

import com.priorisationepic.application.SessionStateView;
import com.priorisationepic.application.SessionStateView.ExactValueView;
import com.priorisationepic.application.SessionStateView.FeatureView;
import com.priorisationepic.domain.method.ComputedValueDefinition;
import com.priorisationepic.domain.method.CriterionDefinition;
import com.priorisationepic.domain.method.MethodDefinition;
import java.util.ArrayList;
import java.util.List;

/**
 * Les colonnes et les lignes communes au CSV tableau et à Confluence (contracts/file-formats.md) :
 * {@code Rang;Identifiant;Titre;Description;<critères>;<calculées>;À revoir;Motif}, dans l'ordre du
 * tableau. Les colonnes de critères et de valeurs calculées viennent de la définition de la
 * méthode. Une fonctionnalité incomplète n'a ni rang ni valeurs calculées. Les cellules vides sont
 * des chaînes vides.
 */
record ExportTable(List<String> headers, List<Row> rows) {

  static final String RANK = "Rang";
  static final String REVIEW = "À revoir";
  static final String REASON = "Motif";

  /** Une ligne : ses cellules, dans l'ordre des en-têtes. */
  record Row(List<String> cells) {}

  static ExportTable of(SessionStateView state, ImportTexts texts) {
    MethodDefinition method = state.methodDefinition();
    List<String> headers = new ArrayList<>();
    headers.add(RANK);
    headers.add(TabularImport.ID);
    headers.add(TabularImport.TITLE);
    headers.add(TabularImport.DESCRIPTION);
    method.criteria().forEach(criterion -> headers.add(criterion.header()));
    method.computedValues().forEach(value -> headers.add(value.header()));
    headers.add(REVIEW);
    headers.add(REASON);

    String yes = texts.text("export.review.yes");
    List<Row> rows = new ArrayList<>();
    for (FeatureView feature : state.features()) {
      boolean complete = feature.score().complete();
      List<String> cells = new ArrayList<>();
      cells.add(
          complete && feature.score().rank() != null ? feature.score().rank().toString() : "");
      cells.add(feature.externalId());
      cells.add(feature.title());
      cells.add(orEmpty(feature.description()));
      for (CriterionDefinition criterion : method.criteria()) {
        Integer value = feature.criteria().get(criterion.key());
        cells.add(value == null ? "" : value.toString());
      }
      for (ComputedValueDefinition value : method.computedValues()) {
        ExactValueView computed = complete ? feature.score().computed().get(value.key()) : null;
        cells.add(computed == null ? "" : computed.display());
      }
      cells.add(feature.markedForReview() ? yes : "");
      cells.add(orEmpty(feature.reviewReason()));
      rows.add(new Row(List.copyOf(cells)));
    }
    return new ExportTable(List.copyOf(headers), List.copyOf(rows));
  }

  private static String orEmpty(String text) {
    return text == null ? "" : text;
  }
}
