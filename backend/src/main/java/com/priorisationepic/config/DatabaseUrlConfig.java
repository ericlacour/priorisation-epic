package com.priorisationepic.config;

import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/**
 * Convertit {@code DATABASE_URL}, au format {@code
 * postgresql://user:pass@host[:port]/db?sslmode=require} (celui de Neon), en {@code
 * spring.datasource.url} JDBC, {@code username} et {@code password}, en conservant les paramètres
 * de requête comme {@code sslmode}. Sans {@code DATABASE_URL}, ou si {@code spring.datasource.url}
 * est déjà défini, {@code SPRING_DATASOURCE_*} s'applique tel quel.
 */
public class DatabaseUrlConfig implements EnvironmentPostProcessor {

  static final String PROPERTY_SOURCE = "databaseUrl";

  @Override
  public void postProcessEnvironment(
      ConfigurableEnvironment environment, SpringApplication application) {
    String databaseUrl = environment.getProperty("DATABASE_URL");
    if (databaseUrl == null
        || databaseUrl.isBlank()
        || environment.containsProperty("spring.datasource.url")) {
      return;
    }
    environment
        .getPropertySources()
        .addFirst(new MapPropertySource(PROPERTY_SOURCE, convert(databaseUrl.strip())));
  }

  /** Propriétés Spring correspondant à une URL {@code postgresql://…} ou {@code postgres://…}. */
  static Map<String, Object> convert(String databaseUrl) {
    URI uri;
    try {
      uri = new URI(databaseUrl);
    } catch (URISyntaxException e) {
      throw new IllegalStateException(
          "DATABASE_URL invalide : attendu postgresql://utilisateur:motdepasse@hôte[:port]/base");
    }
    String scheme = uri.getScheme() == null ? "" : uri.getScheme();
    if (!scheme.equals("postgresql") && !scheme.equals("postgres")) {
      throw new IllegalStateException("DATABASE_URL invalide : le schéma doit être postgresql://");
    }
    if (uri.getHost() == null || uri.getRawPath() == null || uri.getRawPath().length() <= 1) {
      throw new IllegalStateException("DATABASE_URL invalide : hôte et nom de base obligatoires");
    }
    StringBuilder jdbc = new StringBuilder("jdbc:postgresql://").append(uri.getHost());
    if (uri.getPort() != -1) {
      jdbc.append(':').append(uri.getPort());
    }
    jdbc.append(uri.getRawPath());
    if (uri.getRawQuery() != null) {
      jdbc.append('?').append(uri.getRawQuery());
    }
    Map<String, Object> properties = new LinkedHashMap<>();
    properties.put("spring.datasource.url", jdbc.toString());
    String userInfo = uri.getRawUserInfo();
    if (userInfo != null) {
      int colon = userInfo.indexOf(':');
      String user = colon < 0 ? userInfo : userInfo.substring(0, colon);
      properties.put("spring.datasource.username", decode(user));
      if (colon >= 0) {
        properties.put("spring.datasource.password", decode(userInfo.substring(colon + 1)));
      }
    }
    return properties;
  }

  private static String decode(String value) {
    return URLDecoder.decode(value, StandardCharsets.UTF_8);
  }
}
