package com.priorisationepic.domain.method;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;

/** Fraction exacte, toujours réduite, de dénominateur strictement positif. */
public record Fraction(BigInteger numerator, BigInteger denominator)
    implements Comparable<Fraction> {

  public Fraction {
    if (denominator.signum() <= 0) {
      throw new IllegalArgumentException("Le dénominateur doit être strictement positif");
    }
    BigInteger gcd = numerator.gcd(denominator);
    if (!gcd.equals(BigInteger.ONE)) {
      numerator = numerator.divide(gcd);
      denominator = denominator.divide(gcd);
    }
  }

  public static Fraction of(long value) {
    return new Fraction(BigInteger.valueOf(value), BigInteger.ONE);
  }

  public static Fraction of(long numerator, long denominator) {
    return new Fraction(BigInteger.valueOf(numerator), BigInteger.valueOf(denominator));
  }

  public Fraction plus(Fraction other) {
    return new Fraction(
        numerator.multiply(other.denominator).add(other.numerator.multiply(denominator)),
        denominator.multiply(other.denominator));
  }

  /** Comparaison exacte par produit croisé. */
  @Override
  public int compareTo(Fraction other) {
    return numerator.multiply(other.denominator).compareTo(other.numerator.multiply(denominator));
  }

  /** Texte affiché, arrondi HALF_UP, avec une virgule décimale. */
  public String format(Display display) {
    int digits = display == Display.DECIMAL_2 ? 2 : 0;
    BigDecimal value =
        new BigDecimal(numerator).divide(new BigDecimal(denominator), digits, RoundingMode.HALF_UP);
    return value.toPlainString().replace('.', ',');
  }

  @Override
  public String toString() {
    return denominator.equals(BigInteger.ONE)
        ? numerator.toString()
        : numerator + "/" + denominator;
  }
}
