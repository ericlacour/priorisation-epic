package com.priorisationepic.adapter.out.io;

import static com.priorisationepic.adapter.out.io.ExportFixtures.EXPORTED_AT;
import static com.priorisationepic.adapter.out.io.ExportFixtures.FAKE;
import static com.priorisationepic.adapter.out.io.ExportFixtures.row;
import static com.priorisationepic.adapter.out.io.ExportFixtures.state;
import static com.priorisationepic.adapter.out.io.ExportFixtures.wsjfBoard;
import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.domain.method.WsjfMethod;
import com.priorisationepic.domain.scale.Scale;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Confluence {@code confluence-v1} : wiki markup et fragment HTML (contracts/file-formats.md). */
class ConfluenceWriterTest {

  private static final String LEGEND =
      "Méthode WSJF v1. Formule : CoD = BV + TC + RR/OE ; WSJF = CoD / JS. Égalités : WSJF"
          + " décroissant, puis CoD décroissant, puis identifiant croissant (sans tenir compte de"
          + " la casse). Les fonctionnalités incomplètes ou hors échelle viennent en fin de"
          + " tableau, par identifiant croissant. Format confluence-v1";

  private final ConfluenceWriter writer = new ConfluenceWriter(ImportFixtures.TEXTS);

  @Test
  void theWikiMarkupHasTheTitleTheLegendAndTheTableInBoardOrder() {
    assertThat(writer.wiki(wsjfBoard(), EXPORTED_AT))
        .isEqualTo(
            "h2. Priorisation Fonctionnalités : PI 27 – Epics (16/10/2026)\n"
                + "\n"
                + LEGEND
                + "\n"
                + "\n"
                + "||Rang||Identifiant||Titre||Description||BV||TC||RR/OE||JS||CoD||WSJF"
                + "||À revoir||Motif||\n"
                + "|1|F-1|Recherche \\| filtres|Ligne 1\\\\Ligne 2 ; « citée »|8|5|3|4|16|4,00| | |\n"
                + "|2|F-2|Paiement| |2|2|2|3|6|2,00|oui|descriptif à compléter|\n"
                + "| |F-3|Incomplète| |6| | | | | | | |\n");
  }

  @Test
  void wikiSpecialCharactersAreEscapedAndLineBreaksBecomeDoubleBackslashes() {
    String wiki =
        writer.wiki(
            state(
                WsjfMethod.version1(),
                Scale.defaultScale(),
                "Atelier {1}",
                List.of(row("F-1", "a{b}[c]|d", "un\r\ndeux\rtrois\nquatre", 1, 1, 1, 1))),
            EXPORTED_AT);

    assertThat(wiki)
        .startsWith("h2. Priorisation Fonctionnalités : Atelier \\{1\\} (16/10/2026)\n")
        .contains("|1|F-1|a\\{b\\}\\[c\\]\\|d|un\\\\deux\\\\trois\\\\quatre|");
  }

  @Test
  void aBackslashIsEscapedSoThatItNeverEscapesTheCellSeparator() {
    String wiki =
        writer.wiki(
            state(
                WsjfMethod.version1(),
                Scale.defaultScale(),
                "Atelier",
                List.of(row("F-1", "C:\\temp\\", "a\\[b]", 1, 1, 1, 1))),
            EXPORTED_AT);

    // Titre « C:\temp\ » et description « a\[b] » : chaque \ devient l'entité &#92; (doublé, ce
    // serait un saut de ligne), [ et ] restent échappés.
    assertThat(wiki).contains("|1|F-1|C:&#92;temp&#92;|a&#92;\\[b\\]|1|1|1|1|3|3,00| | |\n");
  }

  @Test
  void theHtmlFragmentIsATableWithoutExternalStyles() {
    String html = writer.html(wsjfBoard(), EXPORTED_AT);

    assertThat(html)
        .startsWith("<h2>Priorisation Fonctionnalités : PI 27 – Epics (16/10/2026)</h2>\n")
        .contains("<p>" + LEGEND + "</p>\n")
        .contains(
            "<thead><tr><th>Rang</th><th>Identifiant</th><th>Titre</th><th>Description</th>"
                + "<th>BV</th><th>TC</th><th>RR/OE</th><th>JS</th><th>CoD</th><th>WSJF</th>"
                + "<th>À revoir</th><th>Motif</th></tr></thead>")
        .contains(
            "<tr><td>1</td><td>F-1</td><td>Recherche | filtres</td>"
                + "<td>Ligne 1<br>Ligne 2 ; « citée »</td><td>8</td><td>5</td><td>3</td>"
                + "<td>4</td><td>16</td><td>4,00</td><td></td><td></td></tr>")
        .contains("<tr><td></td><td>F-3</td>")
        .doesNotContain("style", "class=", "<link");
  }

  @Test
  void htmlTextsAreEscaped() {
    String html =
        writer.html(
            state(
                WsjfMethod.version1(),
                Scale.defaultScale(),
                "R&D <b>",
                List.of(row("F-1", "<script>alert('x')</script>", "a \"b\" & c", 1, 1, 1, 1))),
            EXPORTED_AT);

    assertThat(html)
        .contains("R&amp;D &lt;b&gt;")
        .contains("<td>&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;</td>")
        .contains("<td>a &quot;b&quot; &amp; c</td>")
        .doesNotContain("<script>");
  }

  @Test
  void anotherMethodGetsItsOwnColumnsAndLegend() {
    String wiki =
        writer.wiki(
            state(
                FAKE,
                Scale.defaultScale(),
                "Atelier",
                List.of(
                    new ExportFixtures.Row(
                        "R-1", "Portée", null, Map.of("reach", 8, "effort", 2), null))),
            EXPORTED_AT);

    assertThat(wiki)
        .contains(
            "Méthode Reach / Effort v1. Formule : Ratio = Reach / Effort. Égalités : Ratio"
                + " décroissant, puis identifiant croissant. Format confluence-v1")
        .contains(
            "||Rang||Identifiant||Titre||Description||Reach||Effort||Ratio||À revoir||Motif||\n")
        .contains("|1|R-1|Portée| |8|2|4,00| | |\n");
  }
}
