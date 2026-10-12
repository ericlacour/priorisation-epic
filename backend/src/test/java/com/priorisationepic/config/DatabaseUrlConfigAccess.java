package com.priorisationepic.config;

import java.util.Map;

/** Rend {@code DatabaseUrlConfig.convert} accessible aux tests des autres paquets. */
public final class DatabaseUrlConfigAccess {

  private DatabaseUrlConfigAccess() {}

  public static Map<String, Object> convert(String databaseUrl) {
    return DatabaseUrlConfig.convert(databaseUrl);
  }
}
