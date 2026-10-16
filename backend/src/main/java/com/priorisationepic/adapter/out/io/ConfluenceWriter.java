package com.priorisationepic.adapter.out.io;

import com.priorisationepic.application.SessionStateView;
import com.priorisationepic.domain.method.MethodDefinition;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Confluence, format {@code confluence-v1} (contracts/file-formats.md) : les colonnes et les lignes
 * du CSV tableau, sous le titre « Priorisation Fonctionnalités : <nom> (<JJ/MM/AAAA>) » et une
 * légende qui rappelle la méthode, sa formule, sa règle d'égalité et la version du format
 * (constitution I).
 *
 * <ul>
 *   <li>{@link #wiki} : du <i>wiki markup</i> ; {@code \} devient l'entité {@code &#92;}, {@code |
 *       { } [ ] !} sont échappés avec {@code \} (pas de macro, de lien ni d'image externe), les
 *       sauts de ligne deviennent {@code \\}, une cellule vide contient une espace.
 *   <li>{@link #html} : un fragment HTML sans style, copié dans le presse-papiers par « Copier pour
 *       Confluence » ; les sauts de ligne deviennent {@code <br>}.
 * </ul>
 */
@Component
public class ConfluenceWriter {

  static final String VERSION = "confluence-v1";

  /** La date du titre est celle de l'export, à l'heure de Paris (application en français). */
  private static final ZoneId ZONE = ZoneId.of("Europe/Paris");

  private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");
  private static final Pattern LINE_BREAK = Pattern.compile("\r\n|\r|\n");

  /** Séparateur de cellule, macros, liens et images ({@code !url!}) : échappés avec {@code \}. */
  private static final Pattern WIKI_SPECIAL = Pattern.compile("([|{}\\[\\]!])");

  /** La barre oblique inverse en entité : {@code \\} est un saut de ligne en wiki markup. */
  private static final String WIKI_BACKSLASH = "&#92;";

  private final ImportTexts texts;

  public ConfluenceWriter(ImportTexts texts) {
    this.texts = texts;
  }

  public String wiki(SessionStateView state, Instant exportedAt) {
    ExportTable table = ExportTable.of(state, texts);
    StringBuilder out = new StringBuilder();
    out.append("h2. ").append(wikiText(title(state, exportedAt))).append("\n\n");
    out.append(wikiText(legend(state))).append("\n\n");
    out.append("||");
    table.headers().forEach(header -> out.append(wikiText(header)).append("||"));
    out.append('\n');
    for (ExportTable.Row row : table.rows()) {
      out.append('|');
      row.cells().forEach(cell -> out.append(wikiCell(cell)).append('|'));
      out.append('\n');
    }
    return out.toString();
  }

  public String html(SessionStateView state, Instant exportedAt) {
    ExportTable table = ExportTable.of(state, texts);
    StringBuilder out = new StringBuilder();
    out.append("<h2>").append(htmlText(title(state, exportedAt))).append("</h2>\n");
    out.append("<p>").append(htmlText(legend(state))).append("</p>\n");
    out.append("<table>\n<thead><tr>");
    table.headers().forEach(header -> out.append("<th>").append(htmlText(header)).append("</th>"));
    out.append("</tr></thead>\n<tbody>\n");
    for (ExportTable.Row row : table.rows()) {
      out.append("<tr>");
      row.cells().forEach(cell -> out.append("<td>").append(htmlText(cell)).append("</td>"));
      out.append("</tr>\n");
    }
    out.append("</tbody>\n</table>\n");
    return out.toString();
  }

  private String title(SessionStateView state, Instant exportedAt) {
    return texts.text("export.title", state.name(), DATE.format(exportedAt.atZone(ZONE)));
  }

  private String legend(SessionStateView state) {
    MethodDefinition method = state.methodDefinition();
    String tieBreak = method.tieBreakRule().strip();
    if (!tieBreak.endsWith(".")) {
      tieBreak += ".";
    }
    return texts.text(
        "export.legend",
        method.name(),
        String.valueOf(method.version()),
        method.formula().strip(),
        tieBreak,
        VERSION);
  }

  /**
   * Un texte en wiki markup : caractères spéciaux échappés, sauts de ligne en {@code \\}. La barre
   * oblique inverse devient une entité : laissée telle quelle en fin de texte, elle échapperait le
   * séparateur de cellule qui suit, et doublée, elle deviendrait un saut de ligne.
   */
  static String wikiText(String text) {
    String escaped = WIKI_SPECIAL.matcher(text.replace("\\", WIKI_BACKSLASH)).replaceAll("\\\\$1");
    return LINE_BREAK.matcher(escaped).replaceAll("\\\\\\\\");
  }

  /** Une cellule vide garde une espace, sans quoi Confluence fusionne les séparateurs. */
  private static String wikiCell(String text) {
    return text.isBlank() ? " " : wikiText(text);
  }

  static String htmlText(String text) {
    StringBuilder out = new StringBuilder(text.length());
    for (int i = 0; i < text.length(); i++) {
      char c = text.charAt(i);
      switch (c) {
        case '&' -> out.append("&amp;");
        case '<' -> out.append("&lt;");
        case '>' -> out.append("&gt;");
        case '"' -> out.append("&quot;");
        case '\'' -> out.append("&#39;");
        default -> out.append(c);
      }
    }
    return LINE_BREAK.matcher(out).replaceAll("<br>");
  }
}
