package com.priorisationepic.domain.method;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class FractionTest {

  @Test
  void isAlwaysReducedWithAPositiveDenominator() {
    assertThat(Fraction.of(16, 4)).isEqualTo(new Fraction(4, 1));
    assertThat(Fraction.of(-6, -9)).isEqualTo(new Fraction(2, 3));
    assertThat(Fraction.of(3, -6)).isEqualTo(new Fraction(-1, 2));
    assertThat(Fraction.of(0, 7)).isEqualTo(new Fraction(0, 1));
    assertThat(Fraction.of(16, 4).denominator()).isEqualTo(1);
  }

  @Test
  void aZeroDenominatorIsRefused() {
    assertThatThrownBy(() -> Fraction.of(1, 0)).isInstanceOf(ArithmeticException.class);
  }

  @Test
  void addsAndDividesExactly() {
    assertThat(Fraction.of(1, 2).plus(Fraction.of(1, 3))).isEqualTo(Fraction.of(5, 6));
    assertThat(Fraction.of(16).dividedBy(Fraction.of(10))).isEqualTo(Fraction.of(8, 5));
  }

  @Test
  void comparesByCrossProduct() {
    assertThat(Fraction.of(1, 3)).isLessThan(Fraction.of(1, 2));
    assertThat(Fraction.of(2, 4)).isEqualByComparingTo(Fraction.of(1, 2));
    assertThat(Fraction.of(5, 1)).isGreaterThan(Fraction.of(14, 3));
    assertThat(Fraction.of(-1, 2)).isLessThan(Fraction.of(0, 1));
  }

  @Test
  void roundsHalfUpWhenDisplayed() {
    assertThat(Fraction.of(1, 8).display(Display.DECIMAL_2)).isEqualTo("0,13");
    assertThat(Fraction.of(3, 8).display(Display.DECIMAL_2)).isEqualTo("0,38");
    assertThat(Fraction.of(1, 2).display(Display.INTEGER)).isEqualTo("1");
    assertThat(Fraction.of(-1, 800).display(Display.DECIMAL_2)).isEqualTo("0,00");
  }

  @Test
  void displaysIntegersWithoutDecimals() {
    assertThat(Fraction.of(16).display(Display.INTEGER)).isEqualTo("16");
    assertThat(Fraction.of(16).display(Display.DECIMAL_2)).isEqualTo("16,00");
    assertThat(Fraction.of(1234).display(Display.INTEGER)).isEqualTo("1234");
  }
}
