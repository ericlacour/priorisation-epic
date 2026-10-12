package com.priorisationepic.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.security.SecureRandom;
import java.util.HashSet;
import java.util.Set;
import java.util.SplittableRandom;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class IdGeneratorTest {

  private final IdGenerator ids = new IdGenerator(new SecureRandom());

  @Test
  void uuidsAreVersion4() {
    UUID id = ids.newUuid();
    assertThat(id.version()).isEqualTo(4);
    assertThat(id.variant()).isEqualTo(2);
    assertThat(UUID.fromString(id.toString())).isEqualTo(id);
  }

  @Test
  void doesNotRepeat() {
    Set<String> seen = new HashSet<>();
    for (int i = 0; i < 1000; i++) {
      assertThat(seen.add(ids.newSessionId().value())).isTrue();
      assertThat(seen.add(ids.newUuid().toString())).isTrue();
      assertThat(seen.add(ids.newToken())).isTrue();
    }
  }

  @Test
  void isDeterministicWithASeededGenerator() {
    IdGenerator a = new IdGenerator(new SplittableRandom(42));
    IdGenerator b = new IdGenerator(new SplittableRandom(42));
    assertThat(a.newSessionId()).isEqualTo(b.newSessionId());
    assertThat(a.newUuid()).isEqualTo(b.newUuid());
    assertThat(a.newToken()).isEqualTo(b.newToken());
  }

  @Test
  void requiresARandomGenerator() {
    assertThatThrownBy(() -> new IdGenerator(null)).isInstanceOf(NullPointerException.class);
  }
}
