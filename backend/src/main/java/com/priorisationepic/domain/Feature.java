package com.priorisationepic.domain;

import com.priorisationepic.domain.method.Criteria;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * Fonctionnalité à prioriser : identifiant métier, titre, descriptif et valeurs retenues par clé de
 * critère. Les valeurs calculées ne sont jamais stockées. La suppression est douce ({@code
 * deletedAt}) pour garder l'historique. {@code version} sert le verrouillage optimiste.
 */
public record Feature(
    UUID id,
    SessionId sessionId,
    String externalId,
    String title,
    String description,
    Criteria criteria,
    boolean markedForReview,
    String reviewReason,
    Instant deletedAt,
    int version) {

  public static final int EXTERNAL_ID_MAX_LENGTH = 50;
  public static final int TITLE_MAX_LENGTH = 200;
  public static final int DESCRIPTION_MAX_LENGTH = 5000;
  public static final int REVIEW_REASON_MAX_LENGTH = 200;

  public Feature {
    Objects.requireNonNull(id, "id");
    Objects.requireNonNull(sessionId, "sessionId");
    Objects.requireNonNull(criteria, "criteria");
    requireLength(
        externalId, 1, EXTERNAL_ID_MAX_LENGTH, "L'identifiant compte de 1 à 50 caractères.");
    requireLength(title, 1, TITLE_MAX_LENGTH, "Le titre compte de 1 à 200 caractères.");
    requireLength(
        description, 0, DESCRIPTION_MAX_LENGTH, "Le descriptif compte 5 000 caractères au plus.");
    requireLength(
        reviewReason, 0, REVIEW_REASON_MAX_LENGTH, "Le motif compte 200 caractères au plus.");
    if (!markedForReview && reviewReason != null) {
      throw new IllegalArgumentException("Le motif est vidé quand la marque est retirée.");
    }
  }

  public static Feature create(
      UUID id,
      SessionId sessionId,
      String externalId,
      String title,
      String description,
      Criteria criteria) {
    return new Feature(
        id, sessionId, externalId, title, description, criteria, false, null, null, 0);
  }

  public boolean isDeleted() {
    return deletedAt != null;
  }

  public Feature withExternalId(String newExternalId) {
    return new Feature(
        id,
        sessionId,
        newExternalId,
        title,
        description,
        criteria,
        markedForReview,
        reviewReason,
        deletedAt,
        version);
  }

  public Feature withTitle(String newTitle) {
    return new Feature(
        id,
        sessionId,
        externalId,
        newTitle,
        description,
        criteria,
        markedForReview,
        reviewReason,
        deletedAt,
        version);
  }

  public Feature withDescription(String newDescription) {
    return new Feature(
        id,
        sessionId,
        externalId,
        title,
        newDescription,
        criteria,
        markedForReview,
        reviewReason,
        deletedAt,
        version);
  }

  public Feature withCriteria(Criteria newCriteria) {
    return new Feature(
        id,
        sessionId,
        externalId,
        title,
        description,
        newCriteria,
        markedForReview,
        reviewReason,
        deletedAt,
        version);
  }

  /** Pose la marque « à revoir » (FR-006a) ; sans effet sur le score ni sur le tri. */
  public Feature markForReview(String reason) {
    return new Feature(
        id, sessionId, externalId, title, description, criteria, true, reason, deletedAt, version);
  }

  /** Retire la marque et vide le motif. */
  public Feature unmark() {
    return new Feature(
        id, sessionId, externalId, title, description, criteria, false, null, deletedAt, version);
  }

  public Feature deleted(Instant at) {
    return new Feature(
        id,
        sessionId,
        externalId,
        title,
        description,
        criteria,
        markedForReview,
        reviewReason,
        at,
        version);
  }

  private static void requireLength(String text, int min, int max, String message) {
    if (text == null) {
      if (min > 0) {
        throw new IllegalArgumentException(message);
      }
      return;
    }
    int length = text.codePointCount(0, text.length());
    if (length < min || length > max || (min > 0 && text.isBlank())) {
      throw new IllegalArgumentException(message);
    }
  }
}
