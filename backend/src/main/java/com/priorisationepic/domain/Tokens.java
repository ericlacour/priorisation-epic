package com.priorisationepic.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HexFormat;
import java.util.random.RandomGenerator;

/**
 * Jetons de participant et d'animation : 256 bits aléatoires en base64url, jamais stockés. La base
 * ne garde que leur empreinte SHA-256 (64 caractères hexadécimaux), comparée en temps constant.
 */
public final class Tokens {

  private static final int BYTES = 32;

  private Tokens() {}

  /** Jeton aléatoire de 256 bits, en base64url sans remplissage (43 caractères). */
  public static String newToken(RandomGenerator random) {
    byte[] bytes = new byte[BYTES];
    random.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  /** Empreinte SHA-256 du jeton, en hexadécimal minuscule. */
  public static String hash(String token) {
    return HexFormat.of().formatHex(sha256(token));
  }

  /**
   * Vrai si l'empreinte de {@code token} est {@code expectedHash} ; comparaison en temps constant.
   */
  public static boolean matches(String token, String expectedHash) {
    if (token == null || expectedHash == null) {
      return false;
    }
    byte[] actual = HexFormat.of().formatHex(sha256(token)).getBytes(StandardCharsets.US_ASCII);
    return MessageDigest.isEqual(actual, expectedHash.getBytes(StandardCharsets.US_ASCII));
  }

  private static byte[] sha256(String token) {
    try {
      return MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 indisponible", e);
    }
  }
}
