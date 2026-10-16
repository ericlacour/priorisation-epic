package com.priorisationepic.adapter.out.io;

import com.priorisationepic.application.SessionStateView;
import com.priorisationepic.application.SessionStateView.ExactValueView;
import com.priorisationepic.application.SessionStateView.FeatureView;
import com.priorisationepic.domain.method.ComputedValueDefinition;
import com.priorisationepic.domain.method.CriterionDefinition;
import com.priorisationepic.domain.method.MethodDefinition;
import java.time.Instant;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Export JSON complet, {@code formatVersion} 1 (contracts/file-formats.md), que {@link
 * JsonSessionReader} réimporte : la session (nom, statut, méthode, échelle), puis les
 * fonctionnalités dans l'ordre du tableau, avec leurs critères et, à titre informatif, leurs
 * valeurs calculées et leur rang ({@code null} si la fonctionnalité est incomplète). Les critères
 * et les valeurs calculées sont indexés par les clés de la méthode. {@code rounds} reste vide tant
 * que le vote masqué n'existe pas.
 */
@Component
public class JsonSessionWriter {

  private final JsonMapper json;

  public JsonSessionWriter(JsonMapper json) {
    this.json = json;
  }

  public byte[] write(SessionStateView state, Instant exportedAt) {
    MethodDefinition method = state.methodDefinition();
    ObjectNode root = json.createObjectNode();
    root.put("formatVersion", JsonSessionReader.FORMAT_VERSION);
    root.put("exportedAt", exportedAt.toString());
    ObjectNode session = root.putObject("session");
    session.put("name", state.name());
    session.put("status", state.status());
    session.put("method", state.method());
    session.put("methodVersion", state.methodVersion());
    ObjectNode scale = session.putObject("scale");
    scale.put("type", state.scale().type());
    scale.put("max", state.scale().max());

    var features = root.putArray("features");
    for (FeatureView feature : state.features()) {
      ObjectNode node = features.addObject();
      node.put("externalId", feature.externalId());
      node.put("title", feature.title());
      node.put("description", feature.description());
      ObjectNode criteria = node.putObject("criteria");
      for (CriterionDefinition criterion : method.criteria()) {
        Integer value = feature.criteria().get(criterion.key());
        if (value != null) {
          criteria.put(criterion.key(), value);
        }
      }
      node.put("markedForReview", feature.markedForReview());
      node.put("reviewReason", feature.reviewReason());
      if (feature.score().complete()) {
        ObjectNode computed = node.putObject("computed");
        for (ComputedValueDefinition value : method.computedValues()) {
          ExactValueView exact = feature.score().computed().get(value.key());
          computed.put(value.key(), exact.display());
        }
        node.put("rank", feature.score().rank());
      } else {
        node.putNull("computed");
        node.putNull("rank");
      }
    }
    root.putArray("rounds");
    return json.writerWithDefaultPrettyPrinter().writeValueAsBytes(root);
  }
}
