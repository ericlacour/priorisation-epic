package com.priorisationepic.adapter.out.io;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.testmethod.FakeTwoCriteriaMethod;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

/** Le modèle est généré à partir de la définition de la méthode (FR-007a, FR-017b). */
class ImportTemplateWriterTest {

  @Test
  void theHeadersAndExampleFollowTheMethodDefinition() throws IOException {
    byte[] content = new ImportTemplateWriter().write(new FakeTwoCriteriaMethod().definition());

    try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(content))) {
      Sheet sheet = workbook.getSheetAt(0);
      assertThat(sheet.getSheetName()).isEqualTo("Fonctionnalités");
      assertThat(sheet.getRow(0).getLastCellNum()).isEqualTo((short) 5);
      assertThat(sheet.getRow(0).getCell(3).getStringCellValue()).isEqualTo("Reach");
      assertThat(sheet.getRow(0).getCell(4).getStringCellValue()).isEqualTo("Effort");
      assertThat(sheet.getRow(1).getCell(3).getNumericCellValue()).isEqualTo(8);
      assertThat(sheet.getRow(1).getCell(4).getNumericCellValue()).isEqualTo(5);
    }
  }
}
