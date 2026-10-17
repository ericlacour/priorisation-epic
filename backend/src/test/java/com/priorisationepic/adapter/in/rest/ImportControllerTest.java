package com.priorisationepic.adapter.in.rest;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.ContractExamples;
import com.priorisationepic.ContractSchemas;
import com.priorisationepic.PostgresTestBase;
import com.priorisationepic.adapter.in.ws.SessionFixtures;
import com.priorisationepic.adapter.in.ws.WsTestClient;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** Import par fichier de bout en bout contre PostgreSQL : aperçu, confirmation et modèle. */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "priorisation-epic.allowed-origins=https://front.example",
      "priorisation-epic.tick-interval=10m",
      "priorisation-epic.ping-interval=10m"
    })
class ImportControllerTest extends PostgresTestBase {

  private static final String SESSION = SessionFixtures.SESSION_ID;
  private static final String IMPORTS = "/api/sessions/" + SESSION + "/imports";

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;
  @Autowired com.priorisationepic.application.ImportUseCase imports;

  private final HttpClient http = HttpClient.newHttpClient();
  private final JsonMapper json = new JsonMapper();
  private WsTestClient bob;

  @BeforeEach
  void setUp() {
    SessionFixtures.reset(jdbc);
    SessionFixtures.insertSession(jdbc);
    SessionFixtures.insertParticipant(jdbc, "Bob", SessionFixtures.BOB_TOKEN, "PARTICIPANT");
  }

  @AfterEach
  void close() {
    if (bob != null) {
      bob.abort();
    }
  }

  record Response(int status, String contentType, byte[] body) {
    String text() {
      return new String(body, StandardCharsets.UTF_8);
    }

    JsonNode json() {
      return new JsonMapper().readTree(text());
    }
  }

  private Response send(HttpRequest request) throws Exception {
    HttpResponse<byte[]> response = http.send(request, HttpResponse.BodyHandlers.ofByteArray());
    return new Response(
        response.statusCode(),
        response.headers().firstValue("Content-Type").orElse(""),
        response.body());
  }

  private HttpRequest.Builder request(String path, boolean facilitator) {
    HttpRequest.Builder builder =
        HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
            .header("X-Participant-Token", SessionFixtures.ALICE_TOKEN);
    if (facilitator) {
      builder.header("X-Animation-Token", SessionFixtures.ANIMATION_TOKEN);
    }
    return builder;
  }

  private Response upload(String fileName, byte[] content, boolean facilitator) throws Exception {
    return upload(IMPORTS, fileName, content, facilitator);
  }

  private Response upload(String path, String fileName, byte[] content, boolean facilitator)
      throws Exception {
    String boundary = "----frontiere" + UUID.randomUUID();
    ByteArrayOutputStream body = new ByteArrayOutputStream();
    body.write(
        ("--"
                + boundary
                + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\""
                + fileName
                + "\"\r\nContent-Type: application/octet-stream\r\n\r\n")
            .getBytes(StandardCharsets.UTF_8));
    body.write(content);
    body.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
    return send(
        request(path, facilitator)
            .header("Content-Type", "multipart/form-data; boundary=" + boundary)
            .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()))
            .build());
  }

  private Response confirm(String previewId, boolean facilitator) throws Exception {
    return send(
        request(IMPORTS + "/" + previewId + "/confirm", facilitator)
            .POST(HttpRequest.BodyPublishers.noBody())
            .build());
  }

  private static byte[] csv(String text) {
    return text.getBytes(StandardCharsets.UTF_8);
  }

  private static byte[] fixture(String name) throws IOException {
    try (InputStream in = ImportControllerTest.class.getResourceAsStream("/imports/" + name)) {
      return in.readAllBytes();
    }
  }

  private JsonNode problemExample(String name, String instance) throws Exception {
    ObjectNode node = (ObjectNode) json.readTree(ContractExamples.read("problem", name));
    node.put("instance", instance);
    return node;
  }

  private int count(String sql) {
    return jdbc.queryForObject(sql, Integer.class);
  }

  // --- Aperçu ---------------------------------------------------------------------------------

  @Test
  void thePreviewWritesNothingButThePreview() throws Exception {
    Response response =
        upload("fonctionnalites.xlsx", fixture("wsjf-20-lignes-2-invalides.xlsx"), true);

    assertThat(response.status()).isEqualTo(200);
    assertThat(ContractSchemas.validate("import-preview", response.text())).isEmpty();
    JsonNode preview = response.json();
    assertThat(preview.get("sourceType").asString()).isEqualTo("XLSX");
    assertThat(preview.get("validRows")).hasSize(18);
    assertThat(preview.get("rejectedRows")).hasSize(2);
    assertThat(preview.has("scale")).isFalse();
    assertThat(count("select count(*) from feature")).isZero();
    assertThat(count("select version from session")).isZero();
    assertThat(count("select count(*) from import_preview")).isEqualTo(1);
  }

  @Test
  void theConfirmationImportsTheValidRowsThenBroadcastsTheState() throws Exception {
    bob = WsTestClient.open(http, port, SESSION, false);
    bob.hello(SessionFixtures.BOB_TOKEN);
    assertThat(bob.nextContaining("\"type\":\"sessionState\"", 5_000)).isNotNull();
    String previewId =
        upload("fonctionnalites.xlsx", fixture("wsjf-20-lignes-2-invalides.xlsx"), true)
            .json()
            .get("previewId")
            .asString();

    Response response = confirm(previewId, true);

    assertThat(response.status()).isEqualTo(200);
    assertThat(ContractSchemas.validate("import-result", response.text())).isEmpty();
    assertThat(response.json().get("imported").asInt()).isEqualTo(18);
    assertThat(response.json().get("rejected").asInt()).isEqualTo(2);
    assertThat(count("select count(*) from feature")).isEqualTo(18);
    assertThat(count("select version from session")).isEqualTo(1);
    assertThat(count("select count(*) from import_preview")).isZero();
    String state = bob.nextContaining("\"type\":\"sessionState\"", 5_000);
    assertThat(state).isNotNull();
    assertThat(json.readTree(state).get("features")).hasSize(18);
    // Un aperçu ne sert qu'une fois.
    assertThat(confirm(previewId, true).status()).isEqualTo(404);
  }

  @Test
  void anIdentifierTakenSinceThePreviewIsCountedAsRejected() throws Exception {
    String previewId =
        upload("a.csv", csv("Identifiant;Titre\nF-1;Un\nF-2;Deux\n"), true)
            .json()
            .get("previewId")
            .asString();
    jdbc.update(
        "insert into feature (id, session_id, external_id, title) values (?, ?, 'f-2', 'Pris')",
        UUID.randomUUID(),
        SESSION);

    JsonNode result = confirm(previewId, true).json();

    assertThat(result.get("imported").asInt()).isEqualTo(1);
    assertThat(result.get("rejected").asInt()).isEqualTo(1);
  }

  @Test
  void aJsonExportImportedInAnEmptySessionAppliesItsScale() throws Exception {
    Response preview = upload("export.json", fixture("export-wsjf.json"), true);
    assertThat(ContractSchemas.validate("import-preview", preview.text())).isEmpty();
    assertThat(preview.json().get("scale").get("type").asString()).isEqualTo("FIBONACCI");

    confirm(preview.json().get("previewId").asString(), true);

    assertThat(jdbc.queryForObject("select scale_type from session", String.class))
        .isEqualTo("FIBONACCI");
    assertThat(count("select scale_max from session")).isEqualTo(20);
    assertThat(count("select count(*) from feature")).isEqualTo(3);
    assertThat(count("select count(*) from change_log where action = 'SCALE_CHANGE'")).isEqualTo(1);
  }

  @Test
  void aFileWithoutTheRequiredHeadersIsRefusedWhole() throws Exception {
    Response response = upload("sans-titre.csv", fixture("sans-titre.csv"), true);

    assertThat(response.status()).isEqualTo(400);
    assertThat(response.contentType()).startsWith("application/problem+json");
    assertThat(response.json())
        .isEqualTo(problemExample("bad-request-import-missing-headers", IMPORTS));
  }

  @Test
  void aJsonOfAnotherMethodIsRefusedNamingBothMethods() throws Exception {
    String other =
        new String(fixture("export-wsjf.json"), StandardCharsets.UTF_8)
            .replace("\"method\": \"WSJF\"", "\"method\": \"RICE\"");

    Response response = upload("export.json", csv(other), true);

    assertThat(response.status()).isEqualTo(400);
    assertThat(response.json())
        .isEqualTo(problemExample("bad-request-import-other-method", IMPORTS));
  }

  @Test
  void anExpiredPreviewIsNotFound() throws Exception {
    String previewId =
        upload("a.csv", csv("Identifiant;Titre\nF-1;Un\n"), true)
            .json()
            .get("previewId")
            .asString();
    jdbc.update("update import_preview set expires_at = now() - interval '1 second'");

    Response response = confirm(previewId, true);

    assertThat(response.status()).isEqualTo(404);
    assertThat(response.json())
        .isEqualTo(
            problemExample("import-preview-not-found", IMPORTS + "/" + previewId + "/confirm"));
    assertThat(count("select count(*) from feature")).isZero();
  }

  @Test
  void aCallerWithoutTheAnimationTokenIsForbidden() throws Exception {
    Response preview = upload("a.csv", csv("Identifiant;Titre\nF-1;Un\n"), false);

    assertThat(preview.status()).isEqualTo(403);
    assertThat(preview.json()).isEqualTo(problemExample("forbidden", IMPORTS));
    assertThat(count("select count(*) from import_preview")).isZero();

    String previewId =
        upload("a.csv", csv("Identifiant;Titre\nF-1;Un\n"), true)
            .json()
            .get("previewId")
            .asString();
    assertThat(confirm(previewId, false).status()).isEqualTo(403);
    assertThat(count("select count(*) from feature")).isZero();
  }

  @Test
  void aClosedSessionRefusesTheImport() throws Exception {
    String previewId =
        upload("a.csv", csv("Identifiant;Titre\nF-1;Un\n"), true)
            .json()
            .get("previewId")
            .asString();
    jdbc.update("update session set status = 'CLOSED'");

    assertThat(upload("a.csv", csv("Identifiant;Titre\nF-1;Un\n"), true).status()).isEqualTo(403);
    assertThat(confirm(previewId, true).status()).isEqualTo(403);
    assertThat(count("select count(*) from feature")).isZero();
  }

  @Test
  void anUnknownSessionIsNotFound() throws Exception {
    Response response =
        upload(
            "/api/sessions/AAAAAAAAAAAAAAAAAAAAAA/imports",
            "a.csv",
            csv("Identifiant;Titre\nF-1;Un\n"),
            true);

    assertThat(response.status()).isEqualTo(404);
  }

  @Test
  void expiredPreviewsArePurged() throws Exception {
    upload("a.csv", csv("Identifiant;Titre\nF-1;Un\n"), true);
    upload("b.csv", csv("Identifiant;Titre\nF-2;Deux\n"), true);
    jdbc.update(
        "update import_preview set expires_at = now() - interval '1 second'"
            + " where valid_rows -> 0 ->> 'externalId' = 'F-1'");

    assertThat(imports.purgeExpired()).isEqualTo(1);
    assertThat(count("select count(*) from import_preview")).isEqualTo(1);
  }

  @Test
  void aFileTooLargeGets413() throws Exception {
    Response response = upload("gros.csv", new byte[6 * 1024 * 1024], true);

    assertThat(response.status()).isEqualTo(413);
    assertThat(response.contentType()).startsWith("application/problem+json");
  }

  // --- Modèle ---------------------------------------------------------------------------------

  private Sheet template(Response response) throws IOException {
    assertThat(response.status()).isEqualTo(200);
    assertThat(response.contentType())
        .isEqualTo("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return new XSSFWorkbook(new ByteArrayInputStream(response.body())).getSheetAt(0);
  }

  private static String row(Row row) {
    StringBuilder text = new StringBuilder();
    row.forEach(
        cell ->
            text.append(text.isEmpty() ? "" : " | ")
                .append(
                    switch (cell.getCellType()) {
                      case NUMERIC -> String.valueOf((int) cell.getNumericCellValue());
                      default -> cell.getStringCellValue();
                    }));
    return text.toString();
  }

  @Test
  void theTemplateIsTheWsjfOneByDefault() throws Exception {
    Sheet sheet = template(send(request("/api/import-template.xlsx", false).GET().build()));

    assertThat(sheet.getSheetName()).isEqualTo("Fonctionnalités");
    assertThat(row(sheet.getRow(0)))
        .isEqualTo("Identifiant | Titre | Description | BV | TC | RR/OE | JS");
    assertThat(row(sheet.getRow(1)))
        .isEqualTo("F-1 | Exemple de fonctionnalité | Description facultative | 8 | 5 | 3 | 4");
  }

  @Test
  void theTemplateOfAnotherMethodVersionAndAnUnknownMethod() throws Exception {
    Sheet sheet =
        template(
            send(
                request("/api/import-template.xlsx?method=WSJF&methodVersion=2", false)
                    .GET()
                    .build()));
    assertThat(row(sheet.getRow(0)))
        .isEqualTo("Identifiant | Titre | Description | BV | TC | RR/OE | JS");

    Response unknown =
        send(request("/api/import-template.xlsx?method=RICE&methodVersion=1", false).GET().build());
    assertThat(unknown.status()).isEqualTo(400);
  }
}
