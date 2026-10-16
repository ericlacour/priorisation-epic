package com.priorisationepic.adapter.out.io;

import com.priorisationepic.application.ImportContext;
import com.priorisationepic.application.ImportPreview;
import java.io.IOException;
import java.io.StringReader;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.stereotype.Component;

/**
 * Import CSV (contracts/file-formats.md) : UTF-8 avec ou sans BOM, séparateur {@code ;} ou {@code
 * ,} détecté sur la ligne d'en-têtes, guillemets RFC 4180. La première ligne non vide sert
 * d'en-têtes ; les colonnes de critères sont lues dans la définition de la méthode.
 */
@Component
public class CsvFeatureReader {

  private final ImportTexts texts;

  public CsvFeatureReader(ImportTexts texts) {
    this.texts = texts;
  }

  public ImportPreview read(byte[] content, ImportContext context) {
    PreviewBuilder.requireSize(content, texts);
    String text = decode(content);
    TabularImport table = new TabularImport(texts, context, ImportPreview.SourceType.CSV);
    CSVFormat format =
        CSVFormat.RFC4180.builder().setDelimiter(separator(text)).setIgnoreEmptyLines(false).get();
    try (CSVParser parser = CSVParser.parse(new StringReader(text), format)) {
      long previousEnd = 0;
      for (CSVRecord record : parser) {
        int line = (int) previousEnd + 1;
        previousEnd = parser.getCurrentLineNumber();
        List<String> cells = new ArrayList<>(record.size());
        // L'apostrophe ajoutée à l'export contre l'injection de formules est retirée.
        record.forEach(cell -> cells.add(CsvFormulaGuard.unprotect(cell)));
        if (!table.hasHeader()) {
          if (cells.stream().anyMatch(cell -> !cell.isBlank())) {
            table.header(line, cells);
          }
        } else {
          table.row(line, cells);
        }
      }
    } catch (IOException | UncheckedIOException | IllegalStateException e) {
      throw texts.refused("import.refused.unreadable-csv");
    }
    return table.build();
  }

  /** UTF-8 strict, sans le BOM éventuel. */
  private String decode(byte[] content) {
    int offset =
        content.length >= 3
                && content[0] == (byte) 0xEF
                && content[1] == (byte) 0xBB
                && content[2] == (byte) 0xBF
            ? 3
            : 0;
    try {
      return StandardCharsets.UTF_8
          .newDecoder()
          .onMalformedInput(CodingErrorAction.REPORT)
          .onUnmappableCharacter(CodingErrorAction.REPORT)
          .decode(ByteBuffer.wrap(content, offset, content.length - offset))
          .toString();
    } catch (CharacterCodingException e) {
      throw texts.refused("import.refused.not-utf8");
    }
  }

  /**
   * Le séparateur de la première ligne non vide : le plus fréquent de {@code ;} et {@code ,} hors
   * guillemets, {@code ;} à égalité.
   */
  static char separator(String text) {
    int semicolons = 0;
    int commas = 0;
    boolean quoted = false;
    boolean seenContent = false;
    for (int i = 0; i < text.length(); i++) {
      char c = text.charAt(i);
      if (c == '"') {
        quoted = !quoted;
      } else if (!quoted && (c == '\n' || c == '\r')) {
        if (seenContent) {
          break;
        }
      } else if (!quoted && c == ';') {
        semicolons++;
      } else if (!quoted && c == ',') {
        commas++;
      }
      if (!Character.isWhitespace(c)) {
        seenContent = true;
      }
    }
    return commas > semicolons ? ',' : ';';
  }
}
