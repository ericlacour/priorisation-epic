package com.priorisationepic.adapter.out.io;

import com.priorisationepic.application.ImportContext;
import com.priorisationepic.application.ImportFileReader;
import com.priorisationepic.application.ImportPreview;
import java.util.Locale;
import org.springframework.stereotype.Component;

/**
 * Choisit le lecteur d'après l'extension du fichier : {@code .xlsx}, {@code .csv} ou {@code .json}.
 */
@Component
public class ImportFileReaders implements ImportFileReader {

  private final XlsxFeatureReader xlsx;
  private final CsvFeatureReader csv;
  private final JsonSessionReader json;
  private final ImportTexts texts;

  public ImportFileReaders(
      XlsxFeatureReader xlsx, CsvFeatureReader csv, JsonSessionReader json, ImportTexts texts) {
    this.xlsx = xlsx;
    this.csv = csv;
    this.json = json;
    this.texts = texts;
  }

  @Override
  public ImportPreview read(String fileName, byte[] content, ImportContext context) {
    String name = fileName == null ? "" : fileName.toLowerCase(Locale.ROOT).strip();
    if (content.length == 0) {
      throw texts.refused("import.refused.empty");
    }
    if (name.endsWith(".xlsx")) {
      return xlsx.read(content, context);
    }
    if (name.endsWith(".csv")) {
      return csv.read(content, context);
    }
    if (name.endsWith(".json")) {
      return json.read(content, context);
    }
    throw texts.refused("import.refused.unsupported-type");
  }
}
