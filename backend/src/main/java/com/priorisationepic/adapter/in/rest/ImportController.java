package com.priorisationepic.adapter.in.rest;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.priorisationepic.application.ImportPreview;
import com.priorisationepic.application.ImportTemplate;
import com.priorisationepic.application.ImportUseCase;
import com.priorisationepic.application.StoredImportPreview;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.method.WsjfMethod;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Import par fichier (FR-007, FR-007a, FR-008) : aperçu, confirmation et modèle Excel. Les jetons
 * passent dans les en-têtes {@code X-Participant-Token} et {@code X-Animation-Token}, jamais dans
 * l'adresse.
 */
@RestController
public class ImportController {

  static final MediaType XLSX =
      MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  private final ImportUseCase imports;
  private final ImportTemplate template;
  private final MethodRegistry methods;

  public ImportController(ImportUseCase imports, ImportTemplate template, MethodRegistry methods) {
    this.imports = imports;
    this.template = template;
    this.methods = methods;
  }

  /** {@code import-preview.json} */
  record PreviewResponse(
      UUID previewId,
      String sourceType,
      Instant expiresAt,
      List<RowResponse> validRows,
      List<ImportPreview.Rejected> rejectedRows,
      List<ImportPreview.Warning> warnings,
      List<String> ignoredColumns,
      @JsonInclude(JsonInclude.Include.NON_NULL) ScaleResponse scale) {}

  /** Une ligne valide : {@code description} vaut {@code null} plutôt que d'être absente. */
  record RowResponse(
      int line,
      String externalId,
      String title,
      String description,
      Map<String, Integer> criteria) {}

  record ScaleResponse(String type, int max) {}

  /** {@code import-result.json} */
  record ResultResponse(int imported, int rejected) {}

  /** {@code POST /api/sessions/{sessionId}/imports} (previewImport) */
  @PostMapping(
      path = "/api/sessions/{sessionId}/imports",
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  PreviewResponse previewImport(
      @PathVariable String sessionId,
      @RequestHeader(name = "X-Participant-Token", required = false) String participantToken,
      @RequestHeader(name = "X-Animation-Token", required = false) String animationToken,
      @RequestParam("file") MultipartFile file) {
    StoredImportPreview stored =
        imports.preview(
            sessionId, participantToken, animationToken, file.getOriginalFilename(), bytes(file));
    ImportPreview preview = stored.preview();
    return new PreviewResponse(
        stored.id(),
        preview.sourceType().name(),
        stored.expiresAt(),
        preview.validRows().stream()
            .map(
                row ->
                    new RowResponse(
                        row.line(),
                        row.externalId(),
                        row.title(),
                        row.description(),
                        row.criteria()))
            .toList(),
        preview.rejectedRows(),
        preview.warnings(),
        preview.ignoredColumns(),
        preview.scale() == null
            ? null
            : new ScaleResponse(preview.scale().type().name(), preview.scale().max()));
  }

  /** {@code POST /api/sessions/{sessionId}/imports/{previewId}/confirm} (confirmImport) */
  @PostMapping("/api/sessions/{sessionId}/imports/{previewId}/confirm")
  ResultResponse confirmImport(
      @PathVariable String sessionId,
      @PathVariable String previewId,
      @RequestHeader(name = "X-Participant-Token", required = false) String participantToken,
      @RequestHeader(name = "X-Animation-Token", required = false) String animationToken) {
    UUID id;
    try {
      id = UUID.fromString(previewId);
    } catch (IllegalArgumentException e) {
      throw new com.priorisationepic.application.ImportPreviewNotFoundException();
    }
    ImportUseCase.Result result = imports.confirm(sessionId, participantToken, animationToken, id);
    return new ResultResponse(result.imported(), result.rejected());
  }

  /** {@code GET /api/import-template.xlsx} (getImportTemplate) */
  @GetMapping("/api/import-template.xlsx")
  ResponseEntity<byte[]> getImportTemplate(
      @RequestParam(name = "method", defaultValue = WsjfMethod.KEY) String method,
      @RequestParam(name = "methodVersion", defaultValue = "1") int methodVersion) {
    byte[] content = template.write(methods.get(method, methodVersion).definition());
    return ResponseEntity.ok()
        .contentType(XLSX)
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment()
                .filename("modele-import-" + method.toLowerCase(java.util.Locale.ROOT) + ".xlsx")
                .build()
                .toString())
        .body(content);
  }

  private static byte[] bytes(MultipartFile file) {
    try {
      return file.getBytes();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}
