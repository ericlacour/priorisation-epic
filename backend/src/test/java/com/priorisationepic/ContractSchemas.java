package com.priorisationepic;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.Error;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaLocation;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SpecificationVersion;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Valide des messages contre les schémas JSON du contrat ({@code contract/schemas}), source de
 * vérité des échanges (AD-6). Les {@code $ref} entre schémas se résolvent par nom de fichier.
 */
public final class ContractSchemas {

  private static final Path ROOT = Path.of("..", "contract", "schemas");
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final SchemaRegistry REGISTRY =
      SchemaRegistry.withDefaultDialect(
          SpecificationVersion.DRAFT_2020_12,
          builder ->
              builder.schemas(
                  iri -> {
                    String name = iri.substring(iri.lastIndexOf('/') + 1);
                    return Files.exists(ROOT.resolve(name)) ? load(name) : null;
                  }));

  private static final String BASE = "https://contract.test/schemas/";

  private ContractSchemas() {}

  /** Les {@code $id} du contrat sont relatifs : on les ancre sur une base pour les résoudre. */
  private static String load(String name) {
    try {
      return Files.readString(ROOT.resolve(name))
          .replaceFirst("\"\\$id\"\\s*:\\s*\"([^\"]+)\"", "\"\\$id\": \"" + BASE + "$1\"");
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  /** Les erreurs de validation de {@code json} contre le schéma {@code schemaFile} ; vide si OK. */
  public static List<String> violations(String schemaFile, String json) {
    try {
      Schema schema = REGISTRY.getSchema(SchemaLocation.of(BASE + schemaFile));
      JsonNode node = JSON.readTree(json);
      return schema.validate(node).stream().map(Error::getMessage).toList();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}
