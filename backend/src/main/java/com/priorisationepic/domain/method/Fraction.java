package com.priorisationepic.domain.method;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;

/**
 * Fraction exacte, toujours réduite, de dénominateur strictement positif. Le calcul des scores
 * n'utilise jamais de flottant : le tri compare des produits croisés, l'affichage arrondit en
 * dernier (HALF_UP).
 */
public record Fraction(long numerator, long denominator) implements Comparable<Fraction> {

  public Fraction {
    if (denominator == 0) {
      throw new ArithmeticException("Dénominateur nul");
    }
    if (denominator < 0) {
      numerator = Math.negateExact(numerator);
      denominator = Math.negateExact(denominator);
    }
    long gcd = gcd(Math.abs(numerator), denominator);
    if (gcd > 1) {
      numerator /= gcd;
      denominator /= gcd;
    }
  }

  public static Fraction of(long numerator, long denominator) {
    return new Fraction(numerator, denominator);
  }

  public static Fraction of(long integer) {
    return new Fraction(integer, 1);
  }

  public Fraction plus(Fraction other) {
    return new Fraction(
        Math.addExact(
            Math.multiplyExact(numerator, other.denominator),
            Math.multiplyExact(other.numerator, denominator)),
        Math.multiplyExact(denominator, other.denominator));
  }

  public Fraction dividedBy(Fraction other) {
    return new Fraction(
        Math.multiplyExact(numerator, other.denominator),
        Math.multiplyExact(denominator, other.numerator));
  }

  /** Comparaison exacte par produit croisé. */
  @Override
  public int compareTo(Fraction other) {
    return BigInteger.valueOf(numerator)
        .multiply(BigInteger.valueOf(other.denominator))
        .compareTo(BigInteger.valueOf(other.numerator).multiply(BigInteger.valueOf(denominator)));
  }

  /** Texte affiché, virgule décimale française, arrondi HALF_UP. */
  public String display(Display display) {
    int scale = display == Display.INTEGER ? 0 : 2;
    return new BigDecimal(numerator)
        .divide(new BigDecimal(denominator), scale, RoundingMode.HALF_UP)
        .toPlainString()
        .replace('.', ',');
  }

  private static long gcd(long a, long b) {
    while (b != 0) {
      long t = a % b;
      a = b;
      b = t;
    }
    return a == 0 ? 1 : a;
  }
}
