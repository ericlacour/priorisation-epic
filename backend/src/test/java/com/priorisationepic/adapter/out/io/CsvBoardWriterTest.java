package com.priorisationepic.adapter.out.io;

import static com.priorisationepic.adapter.out.io.ExportFixtures.FAKE;
import static com.priorisationepic.adapter.out.io.ExportFixtures.row;
import static com.priorisationepic.adapter.out.io.ExportFixtures.state;
import static com.priorisationepic.adapter.out.io.ExportFixtures.wsjfBoard;
import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.domain.scale.Scale;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** CSV tableau {@code tableau-v1} (contracts/file-formats.md). */
class CsvBoardWriterTest {

  private final CsvBoardWriter writer = new CsvBoardWriter(ImportFixtures.TEXTS);

  private String text(byte[] content) {
    return new String(content, StandardCharsets.UTF_8);
  }

  @Test
  void theFileStartsWithTheUtf8ByteOrderMark() {
    byte[] content = writer.write(wsjfBoard());

    assertThat(Arrays.copyOf(content, 3)).containsExactly((byte) 0xEF, (byte) 0xBB, (byte) 0xBF);
  }

  @Test
  void rowsFollowTheBoardOrderWithColumnsFromTheMethodDefinition() {
    assertThat(text(writer.write(wsjfBoard())))
        .isEqualTo(
            "﻿Rang;Identifiant;Titre;Description;BV;TC;RR/OE;JS;CoD;WSJF;À revoir;Motif\r\n"
                + "1;F-1;Recherche | filtres;\"Ligne 1\nLigne 2 ; « citée »\";8;5;3;4;16;4,00;;\r\n"
                + "2;F-2;Paiement;;2;2;2;3;6;2,00;oui;descriptif à compléter\r\n"
                // Incomplète : ni rang, ni valeurs calculées.
                + ";F-3;Incomplète;;6;;;;;;;\r\n");
  }

  @Test
  void quotesAreDoubledInsideQuotedFields() {
    String text =
        text(
            writer.write(
                state(
                    com.priorisationepic.domain.method.WsjfMethod.version1(),
                    Scale.defaultScale(),
                    "Atelier",
                    List.of(row("F-1", "Le \"vrai\" titre", null, 1, 1, 1, 1)))));

    assertThat(text).contains("1;F-1;\"Le \"\"vrai\"\" titre\";;1;1;1;1;3;3,00;;\r\n");
  }

  @Test
  void aCellASpreadsheetWouldEvaluateIsPrefixedWithAnApostrophe() {
    String text =
        text(
            writer.write(
                state(
                    com.priorisationepic.domain.method.WsjfMethod.version1(),
                    Scale.defaultScale(),
                    "Atelier",
                    List.of(
                        row("=1+1", "=HYPERLINK(\"http://x\";\"y\")", "-Refonte", 1, 1, 1, 1)
                            .review("@moi")))));

    assertThat(text)
        .contains(
            "1;'=1+1;\"'=HYPERLINK(\"\"http://x\"\";\"\"y\"\")\";'-Refonte;1;1;1;1;3;3,00;oui;'@moi\r\n");
  }

  @Test
  void anotherMethodGetsItsOwnColumns() {
    String text =
        text(
            writer.write(
                state(
                    FAKE,
                    Scale.defaultScale(),
                    "Atelier",
                    List.of(
                        new ExportFixtures.Row(
                            "R-1", "Portée", null, Map.of("reach", 8, "effort", 2), null)))));

    assertThat(text)
        .isEqualTo(
            "﻿Rang;Identifiant;Titre;Description;Reach;Effort;Ratio;À revoir;Motif\r\n"
                + "1;R-1;Portée;;8;2;4,00;;\r\n");
  }
}
