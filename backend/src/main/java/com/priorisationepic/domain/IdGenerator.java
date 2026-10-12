package com.priorisationepic.domain;

import java.util.Objects;
import java.util.UUID;
import java.util.random.RandomGenerator;

/**
 * Générateur injectable des identifiants : identifiants de session, UUID version 4 et jetons. Le
 * générateur aléatoire est fourni ({@code SecureRandom} en production, graine fixe dans les tests).
 */
public final class IdGenerator {

  private static final int UUID_BYTES = 16;

  private final RandomGenerator random;

  public IdGenerator(RandomGenerator random) {
    this.random = Objects.requireNonNull(random, "random");
  }

  /** 128 bits aléatoires, base64url sans remplissage (22 caractères). */
  public SessionId newSessionId() {
    return SessionId.random(random);
  }

  /** UUID version 4, tiré du même générateur. */
  public UUID newUuid() {
    byte[] bytes = new byte[UUID_BYTES];
    random.nextBytes(bytes);
    bytes[6] = (byte) ((bytes[6] & 0x0f) | 0x40);
    bytes[8] = (byte) ((bytes[8] & 0x3f) | 0x80);
    long msb = 0;
    long lsb = 0;
    for (int i = 0; i < 8; i++) {
      msb = (msb << 8) | (bytes[i] & 0xff);
      lsb = (lsb << 8) | (bytes[i + 8] & 0xff);
    }
    return new UUID(msb, lsb);
  }

  /** SECRET : jeton de 256 bits en base64url (voir {@link Tokens}). */
  public String newToken() {
    return Tokens.newToken(random);
  }
}
