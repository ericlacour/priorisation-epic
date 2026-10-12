package com.priorisationepic.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.security.SecureRandom;
import java.util.SplittableRandom;
import net.jqwik.api.ForAll;
import net.jqwik.api.Property;
import org.junit.jupiter.api.Test;

class TokensTest {

  @Test
  void aTokenHas256BitsInBase64Url() {
    String token = Tokens.newToken(new SecureRandom());
    assertThat(token).matches("^[A-Za-z0-9_-]{43}$");
  }

  @Test
  void theHashIsASha256InHex() {
    // SHA-256("abc")
    assertThat(Tokens.hash("abc"))
        .isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  }

  @Test
  void matchesTheRightTokenOnly() {
    String hash = Tokens.hash("secret");
    assertThat(Tokens.matches("secret", hash)).isTrue();
    assertThat(Tokens.matches("Secret", hash)).isFalse();
    assertThat(Tokens.matches("secret", Tokens.hash("other"))).isFalse();
    assertThat(Tokens.matches("secret", "short")).isFalse();
  }

  @Test
  void nullNeverMatches() {
    assertThat(Tokens.matches(null, Tokens.hash("x"))).isFalse();
    assertThat(Tokens.matches("x", null)).isFalse();
  }

  @Property
  void aTokenAlwaysMatchesItsOwnHash(@ForAll long seed) {
    String token = Tokens.newToken(new SplittableRandom(seed));
    assertThat(Tokens.matches(token, Tokens.hash(token))).isTrue();
    assertThat(Tokens.hash(token)).hasSize(64);
  }
}
