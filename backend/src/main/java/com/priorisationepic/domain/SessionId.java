package com.priorisationepic.domain;

import java.util.Base64;
import java.util.random.RandomGenerator;
import java.util.regex.Pattern;

/**
 * Identifiant de session : 128 bits aléatoires, en base64url sans remplissage, soit 22 caractères.
 * Il forme le lien d'invitation {@code /s/{sessionId}}.
 */
public record SessionId(String value) {

  public static final int LENGTH = 22;
  private static final Pattern FORMAT = Pattern.compile("^[A-Za-z0-9_-]{" + LENGTH + "}$");
  private static final int BYTES = 16;

  public SessionId {
    if (value == null || !FORMAT.matcher(value).matches()) {
      throw new IllegalArgumentException("Identifiant de session invalide");
    }
  }

  /** Vrai si {@code raw} a la forme d'un identifiant de session. */
  public static boolean isValid(String raw) {
    return raw != null && FORMAT.matcher(raw).matches();
  }

  static SessionId random(RandomGenerator random) {
    byte[] bytes = new byte[BYTES];
    random.nextBytes(bytes);
    return new SessionId(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
  }

  @Override
  public String toString() {
    return value;
  }
}
