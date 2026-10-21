package com.priorisationepic.adapter.out.io;

import static com.priorisationepic.adapter.out.io.ImportFixtures.TEXTS;
import static com.priorisationepic.adapter.out.io.ImportFixtures.file;
import static com.priorisationepic.adapter.out.io.ImportFixtures.ids;
import static com.priorisationepic.adapter.out.io.ImportFixtures.messages;
import static com.priorisationepic.adapter.out.io.ImportFixtures.wsjf;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.application.ImportPreview;
import com.priorisationepic.application.ImportRefusedException;
import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.testmethod.FakeTwoCriteriaMethod;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.Test;

class CsvFeatureReaderTest {

  private final CsvFeatureReader reader = new CsvFeatureReader(TEXTS);

  private ImportPreview read(String text) {
    return reader.read(text.getBytes(StandardCharsets.UTF_8), wsjf());
  }

  @Test
  void semicolonWithBomQuotesAndEmptyLines() {
    ImportPreview preview = reader.read(file("point-virgule-bom.csv"), wsjf());

    assertThat(preview.sourceType()).isEqualTo(ImportPreview.SourceType.CSV);
    assertThat(ids(preview.validRows())).containsExactly("F-1", "F-2");
    ImportPreview.Row first = preview.validRows().getFirst();
    assertThat(first.title()).isEqualTo("Paiement; en un clic");
    assertThat(first.description()).isEqualTo("Ligne 1\nLigne 2");
    assertThat(first.line()).isEqualTo(2);
    ImportPreview.Row second = preview.validRows().get(1);
    assertThat(second.title()).isEqualTo("Export \"comptable\"");
    assertThat(second.line()).isEqualTo(5);
    assertThat(second.criteria()).containsExactly(Map.entry("bv", 2), Map.entry("js", 3));
    assertThat(preview.warnings()).isEmpty();
    assertThat(preview.rejectedRows()).isEmpty();
  }

  @Test
  void commaIsDetectedOnTheHeaderLine() {
    ImportPreview preview = reader.read(file("virgule.csv"), wsjf());

    assertThat(preview.validRows().getFirst().title()).isEqualTo("Paiement, en un clic");
    assertThat(messages(preview)).containsExactly("3: BV = 11 hors échelle : valeur ignorée");
    assertThat(preview.validRows().get(1).criteria())
        .containsExactly(Map.entry("tc", 1), Map.entry("rrOe", 1), Map.entry("js", 1));
  }

  @Test
  void theBoardExportIsReimportedWithoutItsComputedColumns() {
    ImportPreview preview = reader.read(file("export-tableau-v1.csv"), wsjf());

    assertThat(ids(preview.validRows())).containsExactly("F-1", "F-2");
    assertThat(preview.validRows().getFirst().criteria())
        .containsExactly(
            Map.entry("bv", 8), Map.entry("tc", 5), Map.entry("rrOe", 3), Map.entry("js", 4));
    assertThat(preview.ignoredColumns()).isEmpty();
    assertThat(preview.warnings()).isEmpty();
  }

  @Test
  void theApostropheAddedAgainstFormulasIsRemoved() {
    ImportPreview preview =
        read("Identifiant;Titre;Description\n'=1+1;'-Refonte;''@moi\nF-2;'citation';\n");

    assertThat(ids(preview.validRows())).containsExactly("=1+1", "F-2");
    assertThat(preview.validRows().getFirst().title()).isEqualTo("-Refonte");
    assertThat(preview.validRows().getFirst().description()).isEqualTo("'@moi");
    // Une apostrophe qui ne protège rien est gardée.
    assertThat(preview.validRows().get(1).title()).isEqualTo("'citation'");
  }

  @Test
  void aFileWithoutIdentifierOrTitleIsRefusedWhole() {
    assertThatThrownBy(() -> reader.read(file("sans-titre.csv"), wsjf()))
        .isInstanceOf(ImportRefusedException.class)
        .hasMessageContaining("En-têtes attendus : Identifiant, Titre, Description");
    assertThatThrownBy(() -> reader.read(file("sans-identifiant.csv"), wsjf()))
        .isInstanceOf(ImportRefusedException.class)
        .hasMessageContaining("colonnes obligatoires Identifiant et Titre");
  }

  @Test
  void anEmptyFileIsRefused() {
    assertThatThrownBy(() -> read("\n\n  \n"))
        .isInstanceOf(ImportRefusedException.class)
        .hasMessageStartingWith("Le fichier est vide");
  }

  @Test
  void aFileThatIsNotUtf8IsRefused() {
    assertThatThrownBy(() -> reader.read(file("latin1.csv"), wsjf()))
        .isInstanceOf(ImportRefusedException.class)
        .hasMessageStartingWith("Le fichier CSV doit être encodé en UTF-8");
  }

  @Test
  void anUnclosedQuoteIsRefused() {
    assertThatThrownBy(() -> read("Identifiant;Titre\nF-1;\"Paiement\n"))
        .isInstanceOf(ImportRefusedException.class)
        .hasMessageStartingWith("Le fichier CSV est illisible");
  }

  @Test
  void rowsAreRejectedForAnEmptyOrTakenIdentifierOrAnEmptyTitle() {
    ImportPreview preview =
        read("Identifiant;Titre\n;Sans id\nF-1;\nF-EXIST;Pris\nF-2;Ok\nf-2;Doublon\n");

    assertThat(ids(preview.validRows())).containsExactly("F-2");
    assertThat(ImportFixtures.reasons(preview))
        .containsExactly(
            "2 null: Identifiant vide",
            "3 F-1: Titre vide",
            "4 F-EXIST: Identifiant déjà utilisé",
            "6 f-2: Identifiant déjà utilisé");
  }

  @Test
  void theCriteriaColumnsComeFromTheMethodDefinition() {
    ImportPreview preview =
        reader.read(
            file("methode-fictive.csv"),
            ImportFixtures.context(new FakeTwoCriteriaMethod(), Scale.defaultScale(), false));

    assertThat(preview.validRows().getFirst().criteria())
        .containsExactly(Map.entry("reach", 8), Map.entry("effort", 2));
    assertThat(preview.ignoredColumns()).containsExactly("BV");
    assertThat(messages(preview)).containsExactly("1: Colonne « BV » inconnue : ignorée");
  }

  @Test
  void limitsOf5MbAnd1000Rows() {
    StringBuilder text = new StringBuilder("Identifiant;Titre\n");
    for (int i = 1; i <= 1000; i++) {
      text.append("F-").append(i).append(";Titre\n");
    }
    assertThat(read(text.toString()).validRows()).hasSize(1000);
    assertThatThrownBy(() -> read(text + "F-1001;Titre\n"))
        .isInstanceOf(ImportRefusedException.class)
        .hasMessageStartingWith("Le fichier dépasse 1 000 lignes");
    assertThatThrownBy(() -> reader.read(new byte[5 * 1024 * 1024 + 1], wsjf()))
        .isInstanceOf(ImportRefusedException.class)
        .hasMessage("Le fichier dépasse 5 Mo : découpez-le en plusieurs imports.");
  }

  @Test
  void theSeparatorIsTheMostFrequentOutsideQuotes() {
    assertThat(CsvFeatureReader.separator("Identifiant;Titre")).isEqualTo(';');
    assertThat(CsvFeatureReader.separator("Identifiant,Titre")).isEqualTo(',');
    assertThat(CsvFeatureReader.separator("\n\"a,b,c\";Titre\nx,y,z")).isEqualTo(';');
    assertThat(CsvFeatureReader.separator("a;b,c")).isEqualTo(';');
  }
}
