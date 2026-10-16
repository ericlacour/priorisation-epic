package com.priorisationepic.adapter.in.rest;

import com.priorisationepic.adapter.in.rest.InvalidRequestException.FieldError;
import com.priorisationepic.application.ExportFile;
import com.priorisationepic.application.ExportFormat;
import com.priorisationepic.application.ExportUseCase;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * Exports du tableau et de la session (FR-023, FR-024), ouverts à tout membre, sans jeton : le
 * fichier est servi en pièce jointe, avec son nom versionné (contracts/file-formats.md).
 */
@RestController
public class ExportController {

  private final ExportUseCase exports;

  public ExportController(ExportUseCase exports) {
    this.exports = exports;
  }

  /** {@code GET /api/sessions/{sessionId}/exports/{format}} (exportSession) */
  @GetMapping("/api/sessions/{sessionId}/exports/{format}")
  ResponseEntity<byte[]> exportSession(
      @PathVariable String sessionId, @PathVariable("format") String formatPath) {
    ExportFormat format =
        ExportFormat.fromPath(formatPath)
            .orElseThrow(
                () ->
                    new InvalidRequestException(
                        "error.invalid-request",
                        new FieldError("format", "error.export-format-unknown")));
    ExportFile file = exports.export(sessionId, format);
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(file.contentType()))
        .cacheControl(CacheControl.noStore())
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment().filename(file.fileName()).build().toString())
        .body(file.content());
  }
}
