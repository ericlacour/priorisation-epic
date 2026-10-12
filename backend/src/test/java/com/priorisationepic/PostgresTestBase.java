package com.priorisationepic;

import com.priorisationepic.config.DatabaseUrlConfigAccess;
import java.util.Map;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Base des tests qui démarrent l'application complète : une base PostgreSQL 17 partagée par toute
 * la suite (Testcontainers), dont les propriétés de connexion sont injectées dans le contexte
 * Spring.
 *
 * <p>Sans Docker (poste de développement), {@code TEST_DATABASE_URL} (format {@code DATABASE_URL})
 * désigne une base PostgreSQL existante, dont le schéma est recréé par Flyway.
 */
public abstract class PostgresTestBase {

  private static final PostgreSQLContainer POSTGRES;
  private static final String EXTERNAL_URL = System.getenv("TEST_DATABASE_URL");

  static {
    if (EXTERNAL_URL == null || EXTERNAL_URL.isBlank()) {
      POSTGRES = new PostgreSQLContainer("postgres:17");
      POSTGRES.start();
    } else {
      POSTGRES = null;
    }
  }

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry registry) {
    Map<String, Object> properties =
        POSTGRES == null
            ? DatabaseUrlConfigAccess.convert(EXTERNAL_URL)
            : Map.of(
                "spring.datasource.url", POSTGRES.getJdbcUrl(),
                "spring.datasource.username", POSTGRES.getUsername(),
                "spring.datasource.password", POSTGRES.getPassword());
    properties.forEach((key, value) -> registry.add(key, () -> value));
    // Schéma neuf pour chaque démarrage d'un contexte partageant la base externe.
    registry.add("spring.flyway.clean-disabled", () -> "false");
  }
}
