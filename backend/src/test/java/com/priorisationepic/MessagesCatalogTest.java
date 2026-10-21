package com.priorisationepic;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.application.ErrorCode;
import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.Properties;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Le catalogue des messages (T118, FR-027, constitution V) : chaque code d'erreur du contrat existe
 * côté webservice, et chaque message d'erreur dit ce qui ne va pas et comment corriger.
 */
class MessagesCatalogTest {

  /**
   * Une consigne : un verbe à l'impératif (« Choisissez », « réessayez »…) ou une règle à respecter
   * (« doit », « doivent »).
   */
  private static final Pattern INSTRUCTION =
      Pattern.compile(
          "\\b\\p{L}{3,}ez\\b|\\bdoit\\b|\\bdoivent\\b", Pattern.UNICODE_CHARACTER_CLASS);

  private static Properties catalog() throws IOException {
    Properties properties = new Properties();
    try (Reader reader =
        Files.newBufferedReader(
            Path.of("src", "main", "resources", "messages.properties"), StandardCharsets.UTF_8)) {
      properties.load(reader);
    }
    return properties;
  }

  @Test
  void theErrorCodesAreThoseOfTheContract() throws IOException {
    JsonNode schema =
        JsonMapper.builder()
            .build()
            .readTree(Files.readString(Path.of("..", "contract", "schemas", "error.json")));
    List<String> contract =
        schema
            .path("properties")
            .path("code")
            .path("enum")
            .valueStream()
            .map(JsonNode::asString)
            .toList();

    assertThat(Arrays.stream(ErrorCode.values()).map(Enum::name))
        .containsExactlyInAnyOrderElementsOf(contract);
  }

  @Test
  void everyErrorMessageSaysHowToFixIt() throws IOException {
    Properties catalog = catalog();
    List<String> keys =
        catalog.stringPropertyNames().stream()
            .filter(key -> key.startsWith("error.") || key.startsWith("import.refused."))
            .sorted()
            .toList();

    assertThat(keys).isNotEmpty();
    assertThat(keys)
        .allSatisfy(
            key ->
                assertThat(INSTRUCTION.matcher(catalog.getProperty(key)).find())
                    .as("%s = %s", key, catalog.getProperty(key))
                    .isTrue());
  }
}
