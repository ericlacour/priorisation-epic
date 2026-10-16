package com.priorisationepic.adapter.out.io;

import java.util.regex.Pattern;

/**
 * Protection contre l'injection de formules dans le CSV (contracts/file-formats.md, recommandation
 * de l'OWASP) : un tableur évalue une cellule qui commence par {@code =}, {@code +}, {@code -},
 * {@code @}, une tabulation ou un retour chariot.
 *
 * <ul>
 *   <li>{@link #protect} : à l'export, une apostrophe est ajoutée devant une telle cellule, et
 *       aussi devant une cellule qui commence déjà par des apostrophes suivies d'un de ces
 *       caractères ;
 *   <li>{@link #unprotect} : à l'import, une apostrophe est retirée devant les mêmes cellules.
 * </ul>
 *
 * Les deux règles sont exactement inverses : {@code unprotect(protect(texte))} redonne toujours le
 * texte, ce qui garde l'aller-retour du CSV tableau (constitution VI).
 */
final class CsvFormulaGuard {

  /** Zéro, une ou plusieurs apostrophes, puis un caractère qui déclenche une formule. */
  private static final Pattern RISKY = Pattern.compile("^'*[=+\\-@\t\r]");

  /** Au moins une apostrophe, puis un caractère qui déclenche une formule. */
  private static final Pattern PROTECTED = Pattern.compile("^'+[=+\\-@\t\r]");

  private CsvFormulaGuard() {}

  /** La cellule à écrire dans le CSV : préfixée d'une apostrophe si un tableur l'évaluerait. */
  static String protect(String cell) {
    return RISKY.matcher(cell).find() ? "'" + cell : cell;
  }

  /** La cellule lue dans le CSV, sans l'apostrophe ajoutée par {@link #protect}. */
  static String unprotect(String cell) {
    return cell != null && PROTECTED.matcher(cell).find() ? cell.substring(1) : cell;
  }
}
