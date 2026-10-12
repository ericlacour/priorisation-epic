package com.priorisationepic.adapter.in.rest;

import com.priorisationepic.domain.InvalidParticipantException;
import com.priorisationepic.domain.InvalidPseudoException;
import com.priorisationepic.domain.InvalidSessionException;
import com.priorisationepic.domain.method.UnknownMethodException;
import com.priorisationepic.domain.scale.InvalidScaleException;
import java.net.URI;
import java.util.List;
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
    return problem(HttpStatus.NOT_FOUND, "error.session-not-found", locale);
  }

  @ExceptionHandler(PseudoTakenException.class)
  ProblemDetail pseudoTaken(Locale locale) {
    return problem(HttpStatus.CONFLICT, "error.pseudo-taken", locale);
  }

  @ExceptionHandler(InvalidPseudoException.class)
  ProblemDetail invalidPseudo(Locale locale) {
    return invalid("pseudo", "error.invalid-pseudo", locale);
  }

  @ExceptionHandler(InvalidSessionException.class)
  ProblemDetail invalidName(Locale locale) {
    return invalid("name", "error.invalid-name", locale);
  }

  @ExceptionHandler(InvalidParticipantException.class)
  ProblemDetail invalidBusinessRole(Locale locale) {
    return invalid("businessRole", "error.invalid-business-role", locale);
  }

  @ExceptionHandler(UnknownMethodException.class)
  ProblemDetail unknownMethod(Locale locale) {
    return invalid("method", "error.unknown-method", locale);
  }

  @ExceptionHandler(InvalidScaleException.class)
  ProblemDetail invalidScale(Locale locale) {
    return invalid("scale", "error.invalid-scale", locale);
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

  /** Spring 7 omet {@code type} quand il vaut {@code about:blank} ; le contrat l'exige. */
  @Override
  protected ResponseEntity<Object> createResponseEntity(
      @Nullable Object body, HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
    if (body instanceof ProblemDetail problem && problem.getType() == null) {
      problem.setType(ABOUT_BLANK);
    }
    return super.createResponseEntity(body, headers, statusCode, request);
  }

  /** 400 sur un champ précis : le message sert de {@code detail} et de message du champ. */
  private ProblemDetail invalid(String field, String messageKey, Locale locale) {
    ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, messageKey, locale);
    problem.setProperty("errors", List.of(Map.of("field", field, "message", problem.getDetail())));
    return problem;
  }

  private ProblemDetail problem(HttpStatus status, String messageKey, Locale locale) {
    ProblemDetail problem =
        ProblemDetail.forStatusAndDetail(status, messages.getMessage(messageKey, null, locale));
    problem.setType(ABOUT_BLANK);
    return problem;
  }
}
