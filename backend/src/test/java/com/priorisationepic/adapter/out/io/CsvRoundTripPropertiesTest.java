package com.priorisationepic.adapter.out.io;

import static com.priorisationepic.adapter.out.io.ExportFixtures.state;
import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.application.ImportContext;
import com.priorisationepic.application.ImportPreview;
import com.priorisationepic.application.SessionStateView;
import java.util.Set;
import net.jqwik.api.Arbitrary;
import net.jqwik.api.ForAll;
import net.jqwik.api.Property;
import net.jqwik.api.Provide;

/**
 * Aller-retour du CSV tableau {@code tableau-v1} (FR-024, constitution VI) : exporter le tableau,
 * puis l'importer dans une session vide de même échelle, redonne les mêmes fonctionnalités
 * (identifiant, titre, description, critères), donc les mêmes scores et le même ordre. Les colonnes
 * {@code Rang}, calculées, {@code À revoir} et {@code Motif} sont ignorées sans être signalées.
 */
class CsvRoundTripPropertiesTest {

  private final CsvBoardWriter writer = new CsvBoardWriter(ImportFixtures.TEXTS);
  private final CsvFeatureReader reader = new CsvFeatureReader(ImportFixtures.TEXTS);

  @Provide
  Arbitrary<ExportArbitraries.Generated> sessions() {
    return ExportArbitraries.sessions();
  }

  @Property(tries = 300)
  void anExportReimportedInAnEmptySessionOfTheSameScaleGivesTheSameBoard(
      @ForAll("sessions") ExportArbitraries.Generated session) {
    SessionStateView original = state(session.method(), session.scale(), "Atelier", session.rows());

    ImportPreview preview =
        reader.read(
            writer.write(original),
            new ImportContext(session.method(), session.scale(), Set.of(), false));

    assertThat(preview.rejectedRows()).isEmpty();
    assertThat(preview.warnings()).isEmpty();
    assertThat(preview.ignoredColumns()).isEmpty();
    SessionStateView reimported =
        state(session.method(), session.scale(), "Copie", ExportArbitraries.rows(preview));
    assertThat(ExportArbitraries.prioritized(reimported))
        .isEqualTo(ExportArbitraries.prioritized(original));
  }
}
