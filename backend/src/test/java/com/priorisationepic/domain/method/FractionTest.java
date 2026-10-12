package com.priorisationepic.domain.method;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigInteger;
import org.junit.jupiter.api.Test;

class FractionTest {

  @Test
  void isReducedAndCanonical() {
    Fraction f = Fraction.of(16, 4);
    assertThat(f.numerator()).isEqualTo(BigInteger.valueOf(4));
    assertThat(f.denominator()).isEqualTo(BigInteger.ONE);
    assertThat(f).isEqualTo(Fraction.of(4));
    assertThat(Fraction.of(6, 4)).isEqualTo(Fraction.of(3, 2));
  }

  @Test
  void refusesNonPositiveDenominator() {
    assertThatThrownBy(() -> Fraction.of(1, 0)).isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> Fraction.of(1, -2)).isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void comparesByCrossProduct() {
    assertThat(Fraction.of(1, 3).compareTo(Fraction.of(1, 2))).isNegative();
    assertThat(Fraction.of(2, 3).compareTo(Fraction.of(1, 2))).isPositive();
    assertThat(Fraction.of(2, 4).compareTo(Fraction.of(1, 2))).isZero();
  }

  @Test
  void formatsInteger() {
    assertThat(Fraction.of(16).format(Display.INTEGER)).isEqualTo("16");
    assertThat(Fraction.of(5, 2).format(Display.INTEGER)).isEqualTo("3");
    assertThat(Fraction.of(7, 3).format(Display.INTEGER)).isEqualTo("2");
    assertThat(Fraction.of(0).format(Display.INTEGER)).isEqualTo("0");
  }

  @Test
  void formatsDecimal2HalfUpWithComma() {
    assertThat(Fraction.of(0).format(Display.DECIMAL_2)).isEqualTo("0,00");
    assertThat(Fraction.of(4).format(Display.DECIMAL_2)).isEqualTo("4,00");
    assertThat(Fraction.of(16, 10).format(Display.DECIMAL_2)).isEqualTo("1,60");
    assertThat(Fraction.of(3, 8).format(Display.DECIMAL_2)).isEqualTo("0,38");
    assertThat(Fraction.of(1, 3).format(Display.DECIMAL_2)).isEqualTo("0,33");
    assertThat(Fraction.of(2, 3).format(Display.DECIMAL_2)).isEqualTo("0,67");
    assertThat(Fraction.of(1, 200).format(Display.DECIMAL_2)).isEqualTo("0,01");
    assertThat(Fraction.of(1, 201).format(Display.DECIMAL_2)).isEqualTo("0,00");
    assertThat(Fraction.of(1005, 1000).format(Display.DECIMAL_2)).isEqualTo("1,01");
    assertThat(Fraction.of(12345, 100).format(Display.DECIMAL_2)).isEqualTo("123,45");
  }

  @Test
  void addsExactly() {
    assertThat(Fraction.of(1, 3).plus(Fraction.of(1, 6))).isEqualTo(Fraction.of(1, 2));
  }

  @Test
  void toStringShowsTheFraction() {
    assertThat(Fraction.of(3, 2)).hasToString("3/2");
    assertThat(Fraction.of(3)).hasToString("3");
  }
}
