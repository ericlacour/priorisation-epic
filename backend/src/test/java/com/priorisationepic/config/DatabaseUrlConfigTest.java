package com.priorisationepic.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.mock.env.MockEnvironment;

class DatabaseUrlConfigTest {

  @Test
  void convertsANeonUrlKeepingSslmode() {
    var properties =
        DatabaseUrlConfig.convert(
            "postgresql://neo:s3cret@ep-cool-123.eu-central-1.aws.neon.tech/priorisation?sslmode=require");

    assertThat(properties)
        .containsEntry(
            "spring.datasource.url",
            "jdbc:postgresql://ep-cool-123.eu-central-1.aws.neon.tech/priorisation?sslmode=require")
        .containsEntry("spring.datasource.username", "neo")
        .containsEntry("spring.datasource.password", "s3cret");
  }

  @Test
  void keepsThePortAndAcceptsThePostgresScheme() {
    var properties = DatabaseUrlConfig.convert("postgres://u:p@localhost:5433/pe");

    assertThat(properties)
        .containsEntry("spring.datasource.url", "jdbc:postgresql://localhost:5433/pe");
  }

  @Test
  void decodesPercentEncodedCredentials() {
    var properties = DatabaseUrlConfig.convert("postgresql://us%40er:p%3Aw%2Fd@host/db");

    assertThat(properties)
        .containsEntry("spring.datasource.username", "us@er")
        .containsEntry("spring.datasource.password", "p:w/d");
  }

  @Test
  void acceptsAUrlWithoutPasswordOrCredentials() {
    assertThat(DatabaseUrlConfig.convert("postgresql://u@host/db"))
        .containsEntry("spring.datasource.username", "u")
        .doesNotContainKey("spring.datasource.password");
    assertThat(DatabaseUrlConfig.convert("postgresql://host/db"))
        .containsOnlyKeys("spring.datasource.url");
  }

  @Test
  void rejectsAnInvalidUrl() {
    assertThatThrownBy(() -> DatabaseUrlConfig.convert("mysql://u:p@host/db"))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("postgresql://");
    assertThatThrownBy(() -> DatabaseUrlConfig.convert("postgresql://u:p@host"))
        .isInstanceOf(IllegalStateException.class);
    assertThatThrownBy(() -> DatabaseUrlConfig.convert("postgresql://u:p@ho st/db"))
        .isInstanceOf(IllegalStateException.class);
    assertThatThrownBy(() -> DatabaseUrlConfig.convert("not a url"))
        .isInstanceOf(IllegalStateException.class);
  }

  @Test
  void setsTheDatasourcePropertiesFromDatabaseUrl() {
    var environment =
        new MockEnvironment().withProperty("DATABASE_URL", "postgresql://u:p@host/db");

    new DatabaseUrlConfig().postProcessEnvironment(environment, null);

    assertThat(environment.getProperty("spring.datasource.url"))
        .isEqualTo("jdbc:postgresql://host/db");
    assertThat(environment.getProperty("spring.datasource.username")).isEqualTo("u");
  }

  @Test
  void leavesSpringDatasourceVariablesAloneWithoutDatabaseUrl() {
    var environment =
        new MockEnvironment().withProperty("spring.datasource.url", "jdbc:postgresql://x/y");

    new DatabaseUrlConfig().postProcessEnvironment(environment, null);

    assertThat(environment.getProperty("spring.datasource.url")).isEqualTo("jdbc:postgresql://x/y");
    assertThat(environment.getPropertySources().contains(DatabaseUrlConfig.PROPERTY_SOURCE))
        .isFalse();
  }

  @Test
  void doesNotOverrideAnExplicitDatasourceUrl() {
    var environment =
        new MockEnvironment()
            .withProperty("DATABASE_URL", "postgresql://u:p@host/db")
            .withProperty("spring.datasource.url", "jdbc:postgresql://explicit/db");

    new DatabaseUrlConfig().postProcessEnvironment(environment, null);

    assertThat(environment.getProperty("spring.datasource.url"))
        .isEqualTo("jdbc:postgresql://explicit/db");
  }

  @Test
  void ignoresABlankDatabaseUrl() {
    var environment = new StandardEnvironment();
    new DatabaseUrlConfig().postProcessEnvironment(environment, null);
    assertThat(environment.getPropertySources().contains(DatabaseUrlConfig.PROPERTY_SOURCE))
        .isFalse();
  }
}
