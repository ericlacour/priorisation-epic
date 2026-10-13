package com.priorisationepic;

import com.networknt.schema.Error;
import com.networknt.schema.InputFormat;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaLocation;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SpecificationVersion;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Valide des messages contre les JSON Schema de {@code contract/schemas}, source de vérité des
 * échanges (AD-6). Les schémas se réfèrent les uns aux autres par leur {@code $id} (nom de
 * fichier).
 */
public final class ContractSchemas {

  /** Les {@code $id} du contrat sont des noms de fichier : on les ancre sous une base absolue. */
  private static final String BASE = "https://contract.priorisation-epic.test/schemas/";

  private static final Path ROOT = Path.of("..", "contract", "schemas");
  private static final JsonMapper JSON = JsonMapper.builder().build();
  private static final SchemaRegistry REGISTRY = registry();

  private ContractSchemas() {}

  private static SchemaRegistry registry() {
    try (Stream<Path> files = Files.list(ROOT)) {
      Map<String, String> byId =
          files
              .filter(file -> file.getFileName().toString().endsWith(".json"))
              .collect(
                  Collectors.toMap(
                      file -> BASE + file.getFileName(),
                      file -> {
                        try {
                          ObjectNode schema = (ObjectNode) JSON.readTree(Files.readString(file));
                          schema.put("$id", BASE + file.getFileName());
                          return JSON.writeValueAsString(schema);
                        } catch (IOException e) {
                          throw new UncheckedIOException(e);
                        }
                      }));
      return SchemaRegistry.withDefaultDialect(
          SpecificationVersion.DRAFT_2020_12, builder -> builder.schemas(byId));
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  /** Les erreurs de {@code json} contre {@code schemas/<name>.json} (vide : conforme). */
  public static List<Error> validate(String name, String json) {
    Schema schema = REGISTRY.getSchema(SchemaLocation.of(BASE + name + ".json"));
    return schema.validate(
        json, InputFormat.JSON, ctx -> ctx.executionConfig(c -> c.formatAssertionsEnabled(true)));
  }
}
