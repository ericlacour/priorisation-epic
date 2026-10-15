package com.priorisationepic.adapter.out.io;

import com.priorisationepic.application.ImportContext;
import com.priorisationepic.application.ImportPreview;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

/**
 * Import Excel {@code .xlsx} (contracts/file-formats.md) : seule la première feuille est lue, et sa
 * première ligne non vide sert d'en-têtes. Les cellules numériques et les textes contenant un
 * entier sont acceptés ; les formules sont lues par leur dernière valeur calculée.
 */
@Component
public class XlsxFeatureReader {

  private final ImportTexts texts;

  public XlsxFeatureReader(ImportTexts texts) {
    this.texts = texts;
  }

  public ImportPreview read(byte[] content, ImportContext context) {
    PreviewBuilder.requireSize(content, texts);
    TabularImport table = new TabularImport(texts, context, ImportPreview.SourceType.XLSX);
    try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(content))) {
      if (workbook.getNumberOfSheets() == 0) {
        throw texts.refused("import.refused.empty");
      }
      Sheet sheet = workbook.getSheetAt(0);
      for (Row row : sheet) {
        List<String> cells = cells(row);
        int line = row.getRowNum() + 1;
        if (!table.hasHeader()) {
          if (cells.stream().anyMatch(cell -> !cell.isBlank())) {
            table.header(line, cells);
          }
        } else {
          table.row(line, cells);
        }
      }
    } catch (IOException | org.apache.poi.ooxml.POIXMLException e) {
      throw texts.refused("import.refused.unreadable-xlsx");
    } catch (RuntimeException e) {
      if (e instanceof com.priorisationepic.application.ImportRefusedException refused) {
        throw refused;
      }
      // POI signale un fichier qui n'est pas un classeur .xlsx par diverses exceptions.
      throw texts.refused("import.refused.unreadable-xlsx");
    }
    return table.build();
  }

  private static List<String> cells(Row row) {
    int last = Math.max(row.getLastCellNum(), 0);
    List<String> cells = new ArrayList<>(last);
    for (int i = 0; i < last; i++) {
      cells.add(text(row.getCell(i)));
    }
    return cells;
  }

  /** Le texte d'une cellule ; une formule donne sa dernière valeur calculée. */
  private static String text(Cell cell) {
    if (cell == null) {
      return "";
    }
    CellType type =
        cell.getCellType() == CellType.FORMULA
            ? cell.getCachedFormulaResultType()
            : cell.getCellType();
    return switch (type) {
      case STRING -> cell.getStringCellValue();
      case NUMERIC -> number(cell.getNumericCellValue());
      case BOOLEAN -> Boolean.toString(cell.getBooleanCellValue());
      default -> "";
    };
  }

  /** Un nombre entier sans décimales (8 et non 8.0), les autres tels quels. */
  private static String number(double value) {
    if (value == Math.rint(value) && Math.abs(value) < 1e15) {
      return Long.toString((long) value);
    }
    return BigDecimal.valueOf(value).stripTrailingZeros().toPlainString();
  }
}
