package com.priorisationepic.adapter.out.io;

import static org.assertj.core.api.Assertions.assertThat;

import net.jqwik.api.Arbitraries;
import net.jqwik.api.Arbitrary;
import net.jqwik.api.Example;
import net.jqwik.api.ForAll;
import net.jqwik.api.Property;
import net.jqwik.api.Provide;

/** Protection contre l'injection de formules dans le CSV (OWASP, contracts/file-formats.md). */
class CsvFormulaGuardTest {

  @Example
  void aCellATableWouldEvaluateGetsAnApostrophe() {
    assertThat(CsvFormulaGuard.protect("=HYPERLINK(\"http://x\")"))
        .isEqualTo("'=HYPERLINK(\"http://x\")");
    assertThat(CsvFormulaGuard.protect("+33 6")).isEqualTo("'+33 6");
    assertThat(CsvFormulaGuard.protect("-Refonte")).isEqualTo("'-Refonte");
    assertThat(CsvFormulaGuard.protect("@SUM(A1)")).isEqualTo("'@SUM(A1)");
    assertThat(CsvFormulaGuard.protect("\tx")).isEqualTo("'\tx");
    assertThat(CsvFormulaGuard.protect("\rx")).isEqualTo("'\rx");
  }

  @Example
  void anOrdinaryCellIsUnchanged() {
    assertThat(CsvFormulaGuard.protect("Paiement")).isEqualTo("Paiement");
    assertThat(CsvFormulaGuard.protect("4,00")).isEqualTo("4,00");
    assertThat(CsvFormulaGuard.protect("a=b")).isEqualTo("a=b");
    assertThat(CsvFormulaGuard.protect("'citation'")).isEqualTo("'citation'");
    assertThat(CsvFormulaGuard.protect("")).isEmpty();
  }

  @Example
  void apostrophesBeforeARiskyCharacterGetOneMoreSoTheImportGivesThemBack() {
    assertThat(CsvFormulaGuard.protect("'=x")).isEqualTo("''=x");
    assertThat(CsvFormulaGuard.unprotect("''=x")).isEqualTo("'=x");
    assertThat(CsvFormulaGuard.unprotect("'=x")).isEqualTo("=x");
    assertThat(CsvFormulaGuard.unprotect("'citation'")).isEqualTo("'citation'");
    assertThat(CsvFormulaGuard.unprotect(null)).isNull();
  }

  @Provide
  Arbitrary<String> cells() {
    return Arbitraries.strings().withChars("'=+-@\t\rab ;\"").ofMaxLength(8);
  }

  @Property(tries = 500)
  void theImportGivesBackExactlyTheExportedText(@ForAll("cells") String cell) {
    assertThat(CsvFormulaGuard.unprotect(CsvFormulaGuard.protect(cell))).isEqualTo(cell);
  }

  @Property(tries = 500)
  void anExportedCellNeverStartsWithAFormula(@ForAll("cells") String cell) {
    assertThat(CsvFormulaGuard.protect(cell)).doesNotMatch("(?s)^[=+\\-@\t\r].*");
  }
}
