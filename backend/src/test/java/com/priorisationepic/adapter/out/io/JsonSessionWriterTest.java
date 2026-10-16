package com.priorisationepic.adapter.out.io;

import static com.priorisationepic.adapter.out.io.ExportFixtures.EXPORTED_AT;
import static com.priorisationepic.adapter.out.io.ExportFixtures.wsjfBoard;
import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Export JSON complet, {@code formatVersion} 1 (contracts/file-formats.md). */
class JsonSessionWriterTest {

  private final JsonMapper json = new JsonMapper();
  private final JsonSessionWriter writer = new JsonSessionWriter(json);

  private JsonNode export() {
    return json.readTree(
        new String(writer.write(wsjfBoard(), EXPORTED_AT), StandardCharsets.UTF_8));
  }

  @Test
  void theHeaderGivesTheFormatVersionTheDateAndTheSession() {
    JsonNode root = export();

    assertThat(root.get("formatVersion").asInt()).isEqualTo(1);
    assertThat(root.get("exportedAt").asString()).isEqualTo("2026-10-15T22:30:00Z");
    JsonNode session = root.get("session");
    assertThat(session.get("name").asString()).isEqualTo("PI 27 – Epics");
    assertThat(session.get("status").asString()).isEqualTo("PREPARATION");
    assertThat(session.get("method").asString()).isEqualTo("WSJF");
    assertThat(session.get("methodVersion").asInt()).isEqualTo(1);
    assertThat(session.get("scale").get("type").asString()).isEqualTo("CONTINUOUS");
    assertThat(session.get("scale").get("max").asInt()).isEqualTo(10);
  }

  @Test
  void featuresAreInBoardOrderWithCriteriaComputedValuesAndRank() {
    JsonNode features = export().get("features");

    assertThat(features).hasSize(3);
    JsonNode first = features.get(0);
    assertThat(first.get("externalId").asString()).isEqualTo("F-1");
    assertThat(first.get("title").asString()).isEqualTo("Recherche | filtres");
    assertThat(first.get("description").asString()).isEqualTo("Ligne 1\nLigne 2 ; « citée »");
    assertThat(first.get("criteria").toString())
        .isEqualTo("{\"bv\":8,\"tc\":5,\"rrOe\":3,\"js\":4}");
    assertThat(first.get("computed").toString()).isEqualTo("{\"cod\":\"16\",\"wsjf\":\"4,00\"}");
    assertThat(first.get("rank").asInt()).isEqualTo(1);
    assertThat(first.get("markedForReview").asBoolean()).isFalse();
    assertThat(first.get("reviewReason").isNull()).isTrue();

    JsonNode second = features.get(1);
    assertThat(second.get("externalId").asString()).isEqualTo("F-2");
    assertThat(second.get("description").isNull()).isTrue();
    assertThat(second.get("markedForReview").asBoolean()).isTrue();
    assertThat(second.get("reviewReason").asString()).isEqualTo("descriptif à compléter");

    JsonNode incomplete = features.get(2);
    assertThat(incomplete.get("criteria").toString()).isEqualTo("{\"bv\":6}");
    assertThat(incomplete.get("computed").isNull()).isTrue();
    assertThat(incomplete.get("rank").isNull()).isTrue();
  }

  @Test
  void roundsAreEmptyUntilMaskedVotingExists() {
    JsonNode rounds = export().get("rounds");

    assertThat(rounds.isArray()).isTrue();
    assertThat(rounds).isEmpty();
  }
}
