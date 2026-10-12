package com.priorisationepic.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.SplittableRandom;
import net.jqwik.api.ForAll;
import net.jqwik.api.Property;
import net.jqwik.api.constraints.AlphaChars;
import net.jqwik.api.constraints.StringLength;
import org.junit.jupiter.api.Test;

class SessionIdTest {

  @Test
  void aGeneratedIdHas22Base64UrlCharacters() {
    SessionId id = new IdGenerator(new SplittableRandom(7)).newSessionId();
    assertThat(id.value()).matches("^[A-Za-z0-9_-]{22}$").hasSize(SessionId.LENGTH);
    assertThat(id).hasToString(id.value());
  }

  @Test
  void rejectsAWrongShape() {
    for (String bad :
        new String[] {
          null, "", "short", "A".repeat(23), "A".repeat(21) + "=", "A".repeat(21) + "+"
        }) {
      assertThat(SessionId.isValid(bad)).isFalse();
      assertThatThrownBy(() -> new SessionId(bad)).isInstanceOf(IllegalArgumentException.class);
    }
  }

  @Test
  void acceptsTheContractPattern() {
    assertThat(SessionId.isValid("k3Jx9QvT2mLpZ8wR4nYb7A")).isTrue();
    assertThat(new SessionId("k3Jx9QvT2mLpZ8wR4nYb7A").value()).isEqualTo("k3Jx9QvT2mLpZ8wR4nYb7A");
  }

  @Property
  void everyGeneratedIdIsValid(@ForAll long seed) {
    assertThat(
            SessionId.isValid(new IdGenerator(new SplittableRandom(seed)).newSessionId().value()))
        .isTrue();
  }

  @Property
  void anyAlphabeticStringOfAnotherLengthIsInvalid(
      @ForAll @AlphaChars @StringLength(max = 21) String s) {
    assertThat(SessionId.isValid(s)).isFalse();
  }
}
