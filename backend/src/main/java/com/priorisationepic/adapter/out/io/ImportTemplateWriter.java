package com.priorisationepic.adapter.out.io;

import com.priorisationepic.application.ImportTemplate;
import com.priorisationepic.domain.method.MethodDefinition;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

/**
 * Modèle Excel vierge (FR-007a, contracts/file-formats.md), généré à partir de la définition de la
 * méthode : une feuille « Fonctionnalités », les en-têtes {@code Identifiant}, {@code Titre},
 * {@code Description} puis le {@code header} de chaque critère, et une ligne d'exemple.
 */
@Component
public class ImportTemplateWriter implements ImportTemplate {

  static final String SHEET = "Fonctionnalités";

  /** Valeurs d'exemple des critères, prises dans l'ordre de la définition (8, 5, 3, 4 en WSJF). */
  private static final int[] EXAMPLE_VALUES = {8, 5, 3, 4};

  @Override
  public byte[] write(MethodDefinition method) {
    try (XSSFWorkbook workbook = new XSSFWorkbook();
        ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      Sheet sheet = workbook.createSheet(SHEET);
      CellStyle bold = workbook.createCellStyle();
      Font font = workbook.createFont();
      font.setBold(true);
      bold.setFont(font);

      List<String> headers = TabularImport.expectedHeaders(method);
      Row header = sheet.createRow(0);
      for (int i = 0; i < headers.size(); i++) {
        header.createCell(i).setCellValue(headers.get(i));
        header.getCell(i).setCellStyle(bold);
      }
      Row example = sheet.createRow(1);
      example.createCell(0).setCellValue("F-1");
      example.createCell(1).setCellValue("Exemple de fonctionnalité");
      example.createCell(2).setCellValue("Description facultative");
      for (int i = 0; i < method.criteria().size(); i++) {
        example.createCell(3 + i).setCellValue(EXAMPLE_VALUES[i % EXAMPLE_VALUES.length]);
      }
      sheet.setColumnWidth(0, 14 * 256);
      sheet.setColumnWidth(1, 40 * 256);
      sheet.setColumnWidth(2, 50 * 256);
      sheet.createFreezePane(0, 1);
      workbook.write(out);
      return out.toByteArray();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}
