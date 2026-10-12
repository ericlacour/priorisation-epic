package com.priorisationepic.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.domain.ChangeLogEntry;
import com.priorisationepic.domain.ChangeLogEntry.Action;
import com.priorisationepic.domain.ChangeLogEntry.EntityType;
import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.SessionId;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.SplittableRandom;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ChangeLogWriterTest {

  private static final SessionId SESSION = new SessionId("k3Jx9QvT2mLpZ8wR4nYb7A");
  private static final Pseudo ALICE = Pseudo.of("Alice");
  private static final UUID FEATURE = UUID.fromString("6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f");

  private final List<ChangeLogEntry> entries = new ArrayList<>();
  private final MutableClock clock = new MutableClock(Instant.parse("2026-10-12T08:00:00Z"));
  private final ChangeLogWriter writer =
      new ChangeLogWriter(entries::add, clock::instant, new IdGenerator(new SplittableRandom(3)));

  @Test
  void aChangedValueIsTracedWithAuthorDateFieldAndBothValues() {
    boolean written = writer.valueChanged(SESSION, ALICE, FEATURE, "bv", 5, 8);

    assertThat(written).isTrue();
    assertThat(entries).hasSize(1);
    ChangeLogEntry entry = entries.getFirst();
    assertThat(entry.sessionId()).isEqualTo(SESSION);
    assertThat(entry.author()).isEqualTo(ALICE);
    assertThat(entry.at()).isEqualTo(clock.instant());
    assertThat(entry.entityType()).isEqualTo(EntityType.FEATURE);
    assertThat(entry.entityId()).isEqualTo(FEATURE.toString());
    assertThat(entry.action()).isEqualTo(Action.VALUE_CHANGE);
    assertThat(entry.field()).isEqualTo("bv");
    assertThat(entry.oldValue()).isEqualTo("5");
    assertThat(entry.newValue()).isEqualTo("8");
    assertThat(entry.id().version()).isEqualTo(4);
  }

  @Test
  void anUnchangedValueIsNotTraced() {
    assertThat(writer.valueChanged(SESSION, ALICE, FEATURE, "bv", 5, 5)).isFalse();
    assertThat(writer.valueChanged(SESSION, ALICE, FEATURE, "tc", null, null)).isFalse();
    assertThat(entries).isEmpty();
  }

  @Test
  void enteringOrClearingAValueIsTracedWithANullSide() {
    writer.valueChanged(SESSION, ALICE, FEATURE, "js", null, 3);
    writer.valueChanged(SESSION, ALICE, FEATURE, "js", 3, null);

    assertThat(entries).extracting(ChangeLogEntry::oldValue).containsExactly(null, "3");
    assertThat(entries).extracting(ChangeLogEntry::newValue).containsExactly("3", null);
  }

  @Test
  void aScaleChangeIsTracedOnTheSession() {
    boolean written = writer.scaleChanged(SESSION, ALICE, "CONTINUOUS", 10, "FIBONACCI", 20);

    assertThat(written).isTrue();
    ChangeLogEntry entry = entries.getFirst();
    assertThat(entry.entityType()).isEqualTo(EntityType.SESSION);
    assertThat(entry.entityId()).isEqualTo(SESSION.value());
    assertThat(entry.action()).isEqualTo(Action.SCALE_CHANGE);
    assertThat(entry.field()).isNull();
    assertThat(entry.oldValue()).isEqualTo("{\"type\":\"CONTINUOUS\",\"max\":10}");
    assertThat(entry.newValue()).isEqualTo("{\"type\":\"FIBONACCI\",\"max\":20}");
  }

  @Test
  void anUnchangedScaleIsNotTraced() {
    assertThat(writer.scaleChanged(SESSION, ALICE, "FIBONACCI", 20, "FIBONACCI", 20)).isFalse();
    assertThat(entries).isEmpty();
  }

  @Test
  void changingOnlyTheMaximumOrOnlyTheTypeIsTraced() {
    assertThat(writer.scaleChanged(SESSION, ALICE, "CONTINUOUS", 10, "CONTINUOUS", 20)).isTrue();
    assertThat(writer.scaleChanged(SESSION, ALICE, "CONTINUOUS", 20, "FIBONACCI", 20)).isTrue();
    assertThat(entries).hasSize(2);
  }
}
