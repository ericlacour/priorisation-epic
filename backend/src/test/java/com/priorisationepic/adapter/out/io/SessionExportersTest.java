package com.priorisationepic.adapter.out.io;

import static com.priorisationepic.adapter.out.io.ExportFixtures.EXPORTED_AT;
import static com.priorisationepic.adapter.out.io.ExportFixtures.state;
import static com.priorisationepic.adapter.out.io.ExportFixtures.wsjfBoard;
import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.application.ExportFile;
import com.priorisationepic.application.ExportFormat;
import com.priorisationepic.domain.method.WsjfMethod;
import com.priorisationepic.domain.scale.Scale;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** Noms de fichiers versionnés et types de contenu (« Versions des formats »). */
class SessionExportersTest {

  private final SessionExporters exporters =
      new SessionExporters(
          new CsvBoardWriter(ImportFixtures.TEXTS),
          new ConfluenceWriter(ImportFixtures.TEXTS),
          new JsonSessionWriter(new JsonMapper()));

  private ExportFile export(ExportFormat format) {
    return exporters.write(format, wsjfBoard(), EXPORTED_AT);
  }

  @Test
  void fileNamesCarryTheFormatVersion() {
    assertThat(export(ExportFormat.CSV).fileName()).isEqualTo("pi-27-epics-tableau-v1.csv");
    assertThat(export(ExportFormat.CONFLUENCE_WIKI).fileName())
        .isEqualTo("pi-27-epics-confluence-v1.txt");
    assertThat(export(ExportFormat.CONFLUENCE_HTML).fileName())
        .isEqualTo("pi-27-epics-confluence-v1.html");
    assertThat(export(ExportFormat.JSON).fileName()).isEqualTo("pi-27-epics-session-v1.json");
  }

  @Test
  void contentTypesAreUtf8() {
    assertThat(export(ExportFormat.CSV).contentType()).isEqualTo("text/csv;charset=UTF-8");
    assertThat(export(ExportFormat.CONFLUENCE_WIKI).contentType())
        .isEqualTo("text/plain;charset=UTF-8");
    assertThat(export(ExportFormat.CONFLUENCE_HTML).contentType())
        .isEqualTo("text/html;charset=UTF-8");
    assertThat(export(ExportFormat.JSON).contentType()).isEqualTo("application/json");
  }

  @Test
  void theSessionNameIsReducedToAPortableFileName() {
    assertThat(SessionExporters.slug("Été 2027 : Épopées & co.")).isEqualTo("ete-2027-epopees-co");
    assertThat(SessionExporters.slug("???")).isEqualTo("session");
    assertThat(SessionExporters.slug("a".repeat(120))).hasSize(60);
    assertThat(
            exporters
                .write(
                    ExportFormat.CSV,
                    state(WsjfMethod.version1(), Scale.defaultScale(), "日本", List.of()),
                    EXPORTED_AT)
                .fileName())
        .isEqualTo("session-tableau-v1.csv");
  }
}
