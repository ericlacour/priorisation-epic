package com.priorisationepic.adapter.out.io;

import com.priorisationepic.application.ExportFile;
import com.priorisationepic.application.ExportFormat;
import com.priorisationepic.application.SessionExporter;
import com.priorisationepic.application.SessionStateView;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.Instant;
import java.util.Locale;
import org.springframework.stereotype.Component;

/**
 * Choisit l'écrivain du format et nomme le fichier : le nom de la session réduit à des lettres
 * ASCII, des chiffres et des tirets, puis la version du format (« Versions des formats »,
 * contracts/file-formats.md).
 */
@Component
public class SessionExporters implements SessionExporter {

  static final int SLUG_MAX_LENGTH = 60;
  private static final String DEFAULT_SLUG = "session";

  private final CsvBoardWriter csv;
  private final ConfluenceWriter confluence;
  private final JsonSessionWriter json;

  public SessionExporters(CsvBoardWriter csv, ConfluenceWriter confluence, JsonSessionWriter json) {
    this.csv = csv;
    this.confluence = confluence;
    this.json = json;
  }

  @Override
  public ExportFile write(ExportFormat format, SessionStateView state, Instant exportedAt) {
    String name = slug(state.name());
    return switch (format) {
      case CSV ->
          new ExportFile(
              name + "-" + CsvBoardWriter.VERSION + ".csv",
              "text/csv;charset=UTF-8",
              csv.write(state));
      case CONFLUENCE_WIKI ->
          new ExportFile(
              name + "-" + ConfluenceWriter.VERSION + ".txt",
              "text/plain;charset=UTF-8",
              confluence.wiki(state, exportedAt).getBytes(StandardCharsets.UTF_8));
      case CONFLUENCE_HTML ->
          new ExportFile(
              name + "-" + ConfluenceWriter.VERSION + ".html",
              "text/html;charset=UTF-8",
              confluence.html(state, exportedAt).getBytes(StandardCharsets.UTF_8));
      case JSON ->
          new ExportFile(
              name + "-session-v" + JsonSessionReader.FORMAT_VERSION + ".json",
              "application/json",
              json.write(state, exportedAt));
    };
  }

  /** Le nom de la session pour un nom de fichier : sans accents, en minuscules, avec des tirets. */
  static String slug(String sessionName) {
    String ascii =
        Normalizer.normalize(sessionName, Normalizer.Form.NFD)
            .replaceAll("\\p{M}+", "")
            .toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-");
    if (ascii.length() > SLUG_MAX_LENGTH) {
      ascii = ascii.substring(0, SLUG_MAX_LENGTH);
    }
    ascii = ascii.replaceAll("^-+|-+$", "");
    return ascii.isEmpty() ? DEFAULT_SLUG : ascii;
  }
}
