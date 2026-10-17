package com.priorisationepic.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Clé d'unicité du nom de session (FR-001a). */
class SessionNameTest {

  @Test
  void theKeyIgnoresCaseAndSurroundingSpaces() {
    assertThat(Session.nameKey("PI26T7_TEST")).isEqualTo(Session.nameKey("  pi26t7_test "));
    assertThat(Session.nameKey("PI26T7_TEST")).isEqualTo("pi26t7_test");
  }

  @Test
  void theKeyFoldsCompatibilityFormsButKeepsAccents() {
    // Lettres pleine chasse (NFKC) ; « É » précomposé ou décomposé donne la même clé.
    assertThat(Session.nameKey("ＰＩ 28")).isEqualTo(Session.nameKey("pi 28"));
    assertThat(Session.nameKey("Épics")).isEqualTo(Session.nameKey("Épics"));
    assertThat(Session.nameKey("Épics")).isNotEqualTo(Session.nameKey("Epics"));
  }

  @Test
  void innerSpacesStillCount() {
    assertThat(Session.nameKey("PI 28")).isNotEqualTo(Session.nameKey("PI28"));
  }
}
