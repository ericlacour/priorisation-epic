package com.priorisationepic.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.text.Normalizer;
import org.junit.jupiter.api.Test;

class PseudoTest {

  @Test
  void stripsSurroundingSpaces() {
    assertThat(Pseudo.of("  Alice \u2003").value()).isEqualTo("Alice");
  }

  @Test
  void keepsAtMost40CodePoints() {
    assertThat(Pseudo.of("a".repeat(40)).value()).hasSize(40);
    assertThatThrownBy(() -> Pseudo.of("a".repeat(41))).isInstanceOf(InvalidPseudoException.class);
  }

  @Test
  void countsCodePointsNotChars() {
    assertThat(Pseudo.of("😀".repeat(40)).value().codePointCount(0, 80)).isEqualTo(40);
    assertThatThrownBy(() -> Pseudo.of("😀".repeat(41))).isInstanceOf(InvalidPseudoException.class);
  }

  @Test
  void rejectsBlankAndNull() {
    for (String bad : new String[] {null, "", "   ", "\t\n"}) {
      assertThatThrownBy(() -> Pseudo.of(bad)).isInstanceOf(InvalidPseudoException.class);
    }
  }

  @Test
  void normalizesToNfc() {
    String decomposed = Normalizer.normalize("é", Normalizer.Form.NFD);
    assertThat(Pseudo.of(decomposed).value()).isEqualTo("é");
  }

  @Test
  void theCanonicalConstructorRefusesNonNormalizedValues() {
    assertThatThrownBy(() -> new Pseudo(" Alice")).isInstanceOf(InvalidPseudoException.class);
    assertThatThrownBy(() -> new Pseudo(null)).isInstanceOf(InvalidPseudoException.class);
  }

  @Test
  void comparesIgnoringCase() {
    assertThat(Pseudo.of("ALICE").uniquenessKey()).isEqualTo(Pseudo.of("alice").uniquenessKey());
    assertThat(Pseudo.of("Bob").uniquenessKey()).isNotEqualTo(Pseudo.of("Bobby").uniquenessKey());
  }

  @Test
  void neverShowsThePseudoInToString() {
    assertThat(Pseudo.of("Alice").toString()).doesNotContain("Alice").contains("5");
  }

  @Test
  void theKeyFoldsCompatibilityFormsAndCaseWithoutDependingOnTheLocale() {
    assertThat(Pseudo.of("ＡＬＩＣＥ").uniquenessKey()).isEqualTo(Pseudo.of("alice").uniquenessKey());
    assertThat(Pseudo.of("ÉRIC").uniquenessKey()).isEqualTo(Pseudo.of("éric").uniquenessKey());
    assertThat(Pseudo.of("Éric").uniquenessKey())
        .isEqualTo(Pseudo.of(Normalizer.normalize("Éric", Normalizer.Form.NFD)).uniquenessKey());
  }
}
