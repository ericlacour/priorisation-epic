package com.priorisationepic.adapter.out.io;

import static com.priorisationepic.adapter.out.io.ExportFixtures.EXPORTED_AT;
import static com.priorisationepic.adapter.out.io.ExportFixtures.state;
import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.application.ImportContext;
import com.priorisationepic.application.ImportPreview;
import com.priorisationepic.application.SessionStateView;
import com.priorisationepic.domain.scale.Scale;
import java.util.Set;
import net.jqwik.api.Arbitrary;
import net.jqwik.api.ForAll;
import net.jqwik.api.Property;
import net.jqwik.api.Provide;
import tools.jackson.databind.json.JsonMapper;

/**
 * Aller-retour SC-008 (FR-024, constitution VI) : exporter une session en JSON, puis importer le
 * fichier dans une session vide en préparation, redonne les mêmes fonctionnalités, valeurs, échelle
 * et scores, dans le même ordre. Les tours et les votes ne sont pas réimportés.
 */
class JsonRoundTripPropertiesTest {

  private final JsonMapper json = new JsonMapper();
  private final JsonSessionWriter writer = new JsonSessionWriter(json);
  private final JsonSessionReader reader = new JsonSessionReader(ImportFixtures.TEXTS, json);

  @Provide
  Arbitrary<ExportArbitraries.Generated> sessions() {
    return ExportArbitraries.sessions();
  }

  @Property(tries = 300)
  void anExportReimportedInAnEmptySessionGivesTheSamePrioritizationData(
      @ForAll("sessions") ExportArbitraries.Generated session) {
    SessionStateView original = state(session.method(), session.scale(), "Atelier", session.rows());

    ImportPreview preview =
        reader.read(
            writer.write(original, EXPORTED_AT),
            new ImportContext(session.method(), Scale.defaultScale(), Set.of(), true));

    assertThat(preview.rejectedRows()).isEmpty();
    // Valeurs calculées et rangs du fichier identiques à ceux recalculés : aucun avertissement.
    assertThat(preview.warnings()).isEmpty();
    Scale scale = preview.scale() == null ? Scale.defaultScale() : preview.scale();
    assertThat(scale).isEqualTo(session.scale());
    SessionStateView reimported =
        state(session.method(), scale, "Copie", ExportArbitraries.rows(preview));
    assertThat(ExportArbitraries.prioritized(reimported))
        .isEqualTo(ExportArbitraries.prioritized(original));
  }
}
