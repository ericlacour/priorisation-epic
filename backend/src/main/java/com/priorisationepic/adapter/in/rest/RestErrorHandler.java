package com.priorisationepic.adapter.in.rest;

import com.priorisationepic.application.ForbiddenException;
import com.priorisationepic.application.ImportPreviewNotFoundException;
import com.priorisationepic.application.ImportRefusedException;
import com.priorisationepic.application.PseudoTakenException;
import com.priorisationepic.application.SessionNotFoundException;
import com.priorisationepic.domain.InvalidPseudoException;
import com.priorisationepic.domain.method.UnknownMethodException;
import java.net.URI;
import java.util.Locale;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Erreurs REST en {@code application/problem+json} (RFC 9457), conformes à {@code problem.json}. Le
 * {@code detail} est un message en français lu dans {@code messages.properties}, le catalogue
 * unique des messages d'erreur du back (FR-027).
 */
@RestControllerAdvice
public class RestErrorHandler extends ResponseEntityExceptionHandler {

  static final URI ABOUT_BLANK = URI.create("about:blank");
  private static final Logger LOG = LoggerFactory.getLogger(RestErrorHandler.class);

  private final MessageSource messages;

  public RestErrorHandler(MessageSource messages) {
    this.messages = messages;
  }

  /**
   * {@code Retry-After} : secondes entières avant que la plus ancienne création sorte de la
   * fenêtre.
   */
  @ExceptionHandler(TooManyCreationsException.class)
  ResponseEntity<ProblemDetail> tooManyCreations(TooManyCreationsException e, Locale locale) {
    // Une ligne par refus, sans adresse ni autre détail identifiant.
    LOG.info("Session creation refused: too many creations from one client");
    ProblemDetail problem =
        problem(HttpStatus.TOO_MANY_REQUESTS, "error.too-many-requests", locale);
    return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
        .header(HttpHeaders.RETRY_AFTER, Long.toString(e.retryAfterSeconds()))
        .body(problem);
  }

  @ExceptionHandler(SessionNotFoundException.class)
  ProblemDetail sessionNotFound(Locale locale) {
    ProblemDetail problem = problem(HttpStatus.NOT_FOUND, "error.session-not-found", locale);
    problem.setTitle(messages.getMessage("title.session-not-found", null, locale));
    return problem;
  }

  @ExceptionHandler(ForbiddenException.class)
  ProblemDetail forbidden(Locale locale) {
    ProblemDetail problem = problem(HttpStatus.FORBIDDEN, "error.forbidden", locale);
    problem.setTitle(messages.getMessage("title.forbidden", null, locale));
    return problem;
  }

  /** Fichier d'import refusé en entier : le message dit la cause et quoi faire (FR-007). */
  @ExceptionHandler(ImportRefusedException.class)
  ProblemDetail importRefused(ImportRefusedException e, Locale locale) {
    ProblemDetail problem =
        ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
    problem.setType(ABOUT_BLANK);
    problem.setTitle(messages.getMessage("title.import-refused", null, locale));
    return problem;
  }

  @ExceptionHandler(ImportPreviewNotFoundException.class)
  ProblemDetail importPreviewNotFound(Locale locale) {
    ProblemDetail problem = problem(HttpStatus.NOT_FOUND, "error.import-preview-not-found", locale);
    problem.setTitle(messages.getMessage("title.import-preview-not-found", null, locale));
    return problem;
  }

  @ExceptionHandler(PseudoTakenException.class)
  ProblemDetail pseudoTaken(Locale locale) {
    ProblemDetail problem = problem(HttpStatus.CONFLICT, "error.pseudo-taken", locale);
    problem.setTitle(messages.getMessage("title.pseudo-taken", null, locale));
    return problem;
  }

  /** Un pseudo invalide arrivé jusqu'au cas d'usage (la couche REST le contrôle avant). */
  @ExceptionHandler(InvalidPseudoException.class)
  ProblemDetail invalidPseudo(Locale locale) {
    return invalidRequest(
        new InvalidRequestException(
            "error.invalid-pseudo",
            new InvalidRequestException.FieldError("pseudo", "error.invalid-pseudo")),
        locale);
  }

  @ExceptionHandler(UnknownMethodException.class)
  ProblemDetail unknownMethod(Locale locale) {
    return invalidRequest(
        new InvalidRequestException(
            "error.invalid-request",
            new InvalidRequestException.FieldError("method", "error.unknown-method")),
        locale);
  }

  @ExceptionHandler(InvalidRequestException.class)
  ProblemDetail invalidRequest(InvalidRequestException e, Locale locale) {
    ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, e.detailKey(), locale);
    problem.setTitle(messages.getMessage("title.invalid-request", null, locale));
    problem.setProperty(
        "errors",
        e.errors().stream()
            .map(
                error ->
                    Map.of(
                        "field",
                        error.field(),
                        "message",
                        messages.getMessage(error.messageKey(), null, locale)))
            .toList());
    return problem;
  }

  @ExceptionHandler(MalformedRequestException.class)
  ProblemDetail malformed(Locale locale) {
    return problem(HttpStatus.BAD_REQUEST, "error.malformed-body", locale);
  }

  /** Corps illisible (JSON invalide, type erroné, champ en trop). */
  @Override
  protected ResponseEntity<Object> handleHttpMessageNotReadable(
      HttpMessageNotReadableException ex,
      HttpHeaders headers,
      HttpStatusCode status,
      WebRequest request) {
    ProblemDetail problem =
        problem(HttpStatus.BAD_REQUEST, "error.malformed-body", request.getLocale());
    return handleExceptionInternal(ex, problem, headers, status, request);
  }

  /** Formulaire d'import sans fichier. */
  @Override
  protected ResponseEntity<Object> handleMissingServletRequestPart(
      MissingServletRequestPartException ex,
      HttpHeaders headers,
      HttpStatusCode status,
      WebRequest request) {
    ProblemDetail problem =
        problem(HttpStatus.BAD_REQUEST, "error.import-file-missing", request.getLocale());
    problem.setTitle(messages.getMessage("title.import-refused", null, request.getLocale()));
    return handleExceptionInternal(ex, problem, headers, status, request);
  }

  /** Import sans {@code Content-Length} au-delà de la limite du décodage multipart. */
  @Override
  protected ResponseEntity<Object> handleMaxUploadSizeExceededException(
      MaxUploadSizeExceededException ex,
      HttpHeaders headers,
      HttpStatusCode status,
      WebRequest request) {
    ProblemDetail problem =
        problem(HttpStatus.CONTENT_TOO_LARGE, "error.payload-too-large", request.getLocale());
    problem.setTitle(HttpStatus.CONTENT_TOO_LARGE.getReasonPhrase());
    return handleExceptionInternal(ex, problem, headers, HttpStatus.CONTENT_TOO_LARGE, request);
  }

  /** Spring 7 omet {@code type} quand il vaut {@code about:blank} ; le contrat l'exige. */
  @Override
  protected ResponseEntity<Object> createResponseEntity(
      @Nullable Object body, HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
    if (body instanceof ProblemDetail problem && problem.getType() == null) {
      problem.setType(ABOUT_BLANK);
    }
    return super.createResponseEntity(body, headers, statusCode, request);
  }

  private ProblemDetail problem(HttpStatus status, String messageKey, Locale locale) {
    ProblemDetail problem =
        ProblemDetail.forStatusAndDetail(status, messages.getMessage(messageKey, null, locale));
    problem.setType(ABOUT_BLANK);
    return problem;
  }
}
