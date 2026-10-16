package com.priorisationepic.adapter.out.io;

import com.priorisationepic.application.SessionStateView;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * CSV tableau, format {@code tableau-v1} (contracts/file-formats.md) : UTF-8 avec BOM, séparateur
 * {@code ;}, fins de ligne {@code CRLF}, guillemets RFC 4180 pour un champ qui contient le
 * séparateur, un guillemet ou un saut de ligne. Il s'ouvre tel quel dans un tableur français et se
 * réimporte ({@link CsvFeatureReader}).
 */
@Component
public class CsvBoardWriter {

  static final String VERSION = "tableau-v1";
  private static final char SEPARATOR = ';';
  private static final String BOM = "﻿";
  private static final String END_OF_LINE = "\r\n";

  private final ImportTexts texts;

  public CsvBoardWriter(ImportTexts texts) {
    this.texts = texts;
  }

  public byte[] write(SessionStateView state) {
    ExportTable table = ExportTable.of(state, texts);
    StringBuilder out = new StringBuilder(BOM);
    line(out, table.headers());
    table.rows().forEach(row -> line(out, row.cells()));
    return out.toString().getBytes(StandardCharsets.UTF_8);
  }

  private static void line(StringBuilder out, List<String> cells) {
    for (int i = 0; i < cells.size(); i++) {
      if (i > 0) {
        out.append(SEPARATOR);
      }
      out.append(field(cells.get(i)));
    }
    out.append(END_OF_LINE);
  }

  private static String field(String value) {
    boolean quoted =
        value.indexOf(SEPARATOR) >= 0
            || value.indexOf('"') >= 0
            || value.indexOf('\n') >= 0
            || value.indexOf('\r') >= 0;
    return quoted ? '"' + value.replace("\"", "\"\"") + '"' : value;
  }
}
