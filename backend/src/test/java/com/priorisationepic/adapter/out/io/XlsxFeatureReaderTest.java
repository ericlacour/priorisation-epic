package com.priorisationepic.adapter.out.io;

import static com.priorisationepic.adapter.out.io.ImportFixtures.TEXTS;
import static com.priorisationepic.adapter.out.io.ImportFixtures.file;
import static com.priorisationepic.adapter.out.io.ImportFixtures.ids;
import static com.priorisationepic.adapter.out.io.ImportFixtures.messages;
import static com.priorisationepic.adapter.out.io.ImportFixtures.reasons;
import static com.priorisationepic.adapter.out.io.ImportFixtures.wsjf;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.application.ImportPreview;
import com.priorisationepic.application.ImportRefusedException;
import com.priorisationepic.domain.method.WsjfMethod;
import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.testmethod.FakeTwoCriteriaMethod;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Map;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

class XlsxFeatureReaderTest {

  private final XlsxFeatureReader reader = new XlsxFeatureReader(TEXTS);

  @Test
  void twentyLinesWithTwoInvalidGiveEighteenValidRows() {
    ImportPreview preview = reader.read(file("wsjf-20-lignes-2-invalides.xlsx"), wsjf());

    assertThat(preview.sourceType()).isEqualTo(ImportPreview.SourceType.XLSX);
    assertThat(preview.validRows()).hasSize(18);
    assertThat(reasons(preview))
        .containsExactly("6 null: Identifiant vide", "12 F-3: Identifiant déjà utilisé");
    ImportPreview.Row first = preview.validRows().getFirst();
    assertThat(first.line()).isEqualTo(2);
    assertThat(first.externalId()).isEqualTo("F-1");
    assertThat(first.title()).isEqualTo("Fonctionnalité 1");
    assertThat(first.description()).isNull();
    assertThat(first.criteria())
        .containsExactly(
            Map.entry("bv", 2), Map.entry("tc", 4), Map.entry("rrOe", 8), Map.entry("js", 2));
    assertThat(preview.validRows().get(2).description()).isEqualTo("Description 3");
    assertThat(preview.warnings()).isEmpty();
    assertThat(preview.scale()).isNull();
  }

  @Test
  void headersAreMatchedWithoutCaseNorSpacesAndEveryRuleApplies() {
    ImportPreview preview = reader.read(file("en-tetes-libres.xlsx"), wsjf());

    assertThat(ids(preview.validRows())).containsExactly("F-1", "F-2");
    assertThat(preview.validRows().getFirst().criteria())
        .containsExactly(
            Map.entry("bv", 8), Map.entry("tc", 5), Map.entry("rrOe", 3), Map.entry("js", 4));
    // Valeurs ignorées, ligne importée quand même.
    assertThat(preview.validRows().get(1).criteria()).containsExactly(Map.entry("js", 3));
    assertThat(preview.ignoredColumns()).containsExactly("Priorité");
    assertThat(messages(preview))
        .containsExactly(
            "2: Colonne « Priorité » inconnue : ignorée",
            "5: BV = 12 hors échelle : valeur ignorée",
            "5: TC = « abc » n'est pas un entier : valeur ignorée",
            "5: RR/OE = « 2,5 » n'est pas un entier : valeur ignorée");
    assertThat(reasons(preview))
        .containsExactly(
            "6 null: Identifiant vide",
            "7 F-3: Titre vide",
            "8 f-exist: Identifiant déjà utilisé",
            "9 f-1: Identifiant déjà utilisé",
            "10 F-4: Titre trop long (200 caractères au plus)",
            "11 " + "X".repeat(51) + ": Identifiant trop long (50 caractères au plus)");
  }

  @Test
  void aFileWithoutTitleIsRefusedWhole() {
    assertThatThrownBy(() -> reader.read(file("sans-titre.xlsx"), wsjf()))
        .isInstanceOf(ImportRefusedException.class)
        .hasMessage(
            "Le fichier n'a pas les colonnes obligatoires Identifiant et Titre. En-têtes attendus"
                + " : Identifiant, Titre, Description, BV, TC, RR/OE, JS. Téléchargez le modèle"
                + " pour partir d'un fichier conforme.");
  }

  @Test
  void theCriteriaColumnsComeFromTheMethodDefinition() {
    ImportPreview preview =
        reader.read(
            file("methode-fictive.xlsx"),
            ImportFixtures.context(new FakeTwoCriteriaMethod(), Scale.defaultScale(), false));

    assertThat(preview.validRows().getFirst().criteria())
        .containsExactly(Map.entry("reach", 8), Map.entry("effort", 2));
    assertThat(preview.ignoredColumns()).containsExactly("BV");
  }

  @Test
  void formulasAreReadByTheirComputedValueAndOnlyTheFirstSheetIsRead() throws IOException {
    byte[] content;
    try (XSSFWorkbook workbook = new XSSFWorkbook();
        ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      Sheet sheet = workbook.createSheet("Fonctionnalités");
      Row header = sheet.createRow(0);
      String[] headers = {"Identifiant", "Titre", "BV", "TC", "RR/OE", "JS"};
      for (int i = 0; i < headers.length; i++) {
        header.createCell(i).setCellValue(headers[i]);
      }
      Row row = sheet.createRow(1);
      row.createCell(0).setCellValue(101);
      row.createCell(1).setCellValue("Calculée");
      row.createCell(2).setCellFormula("2*4");
      row.createCell(3).setCellValue(5.0);
      row.createCell(4).setCellFormula("1+2");
      row.createCell(5).setCellValue("4");
      workbook.createSheet("Autre").createRow(0).createCell(0).setCellValue("Identifiant");
      workbook.getCreationHelper().createFormulaEvaluator().evaluateAll();
      workbook.write(out);
      content = out.toByteArray();
    }

    ImportPreview preview = reader.read(content, wsjf());

    assertThat(preview.validRows()).hasSize(1);
    ImportPreview.Row row = preview.validRows().getFirst();
    assertThat(row.externalId()).isEqualTo("101");
    assertThat(row.criteria())
        .containsExactly(
            Map.entry("bv", 8), Map.entry("tc", 5), Map.entry("rrOe", 3), Map.entry("js", 4));
  }

  @Test
  void aFileThatIsNotAnXlsxIsRefused() {
    assertThatThrownBy(() -> reader.read(file("virgule.csv"), wsjf()))
        .isInstanceOf(ImportRefusedException.class)
        .hasMessageStartingWith("Le fichier Excel est illisible");
  }

  @Test
  void aFileOfMoreThan5MbIsRefused() {
    assertThatThrownBy(() -> reader.read(new byte[5 * 1024 * 1024 + 1], wsjf()))
        .isInstanceOf(ImportRefusedException.class)
        .hasMessage("Le fichier dépasse 5 Mo.");
  }

  @Test
  void moreThan1000DataRowsAreRefused() throws IOException {
    assertThat(reader.read(rows(1000), wsjf()).validRows()).hasSize(1000);
    assertThatThrownBy(() -> reader.read(rows(1001), wsjf()))
        .isInstanceOf(ImportRefusedException.class)
        .hasMessageStartingWith("Le fichier dépasse 1 000 lignes de données");
  }

  private static byte[] rows(int count) throws IOException {
    try (XSSFWorkbook workbook = new XSSFWorkbook();
        ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      Sheet sheet = workbook.createSheet();
      Row header = sheet.createRow(0);
      header.createCell(0).setCellValue("Identifiant");
      header.createCell(1).setCellValue("Titre");
      for (int i = 1; i <= count; i++) {
        Row row = sheet.createRow(i);
        row.createCell(0).setCellValue("F-" + i);
        row.createCell(1).setCellValue("Titre " + i);
      }
      workbook.write(out);
      return out.toByteArray();
    }
  }

  @Test
  void theTemplateIsReadBackAsOneValidRow() {
    byte[] template = new ImportTemplateWriter().write(WsjfMethod.version1().definition());

    ImportPreview preview = reader.read(template, wsjf());

    assertThat(preview.validRows()).hasSize(1);
    assertThat(preview.validRows().getFirst().criteria())
        .containsExactly(
            Map.entry("bv", 8), Map.entry("tc", 5), Map.entry("rrOe", 3), Map.entry("js", 4));
    assertThat(preview.warnings()).isEmpty();
  }
}
