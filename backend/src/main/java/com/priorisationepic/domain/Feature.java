package com.priorisationepic.domain;

import com.priorisationepic.domain.method.Criteria;
import com.priorisationepic.domain.method.InvalidValueException;
import com.priorisationepic.domain.method.PrioritizationMethod;
import com.priorisationepic.domain.method.Score;
import com.priorisationepic.domain.scale.Scale;
import java.time.Instant;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

/**
 * Fonctionnalité à prioriser. Immuable : chaque modification renvoie une copie. L'identifiant
 * {@code externalId} est unique par session sans tenir compte de la casse (clé : {@link
 * #externalKey()}). La marque « à revoir » n'a aucun effet sur le score ni sur le tri.
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
    long version) {

  public static final int MAX_EXTERNAL_ID = 50;
  public static final int MAX_TITLE = 200;
  public static final int MAX_DESCRIPTION = 5000;
  public static final int MAX_REVIEW_REASON = 200;

  public Feature {
    Objects.requireNonNull(id, "id");
    Objects.requireNonNull(sessionId, "sessionId");
    Objects.requireNonNull(criteria, "criteria");
    externalId = bounded(externalId, "Identifiant", MAX_EXTERNAL_ID, true);
    title = bounded(title, "Titre", MAX_TITLE, true);
    description = description == null ? "" : description;
    if (description.length() > MAX_DESCRIPTION) {
      throw new InvalidFeatureException("Description trop longue (5 000 caractères au plus)");
    }
  }

  /** Nouvelle fonctionnalité : version 0, sans marque, valeurs contrôlées contre l'échelle. */
  public static Feature create(
      UUID id,
      SessionId sessionId,
      String externalId,
      String title,
      String description,
      Criteria criteria,
      Scale scale) {
    requireInScale(criteria, scale);
    return new Feature(
        id, sessionId, externalId, title, description, criteria, false, null, null, 0);
  }

  /** Clé d'unicité de l'identifiant dans la session : insensible à la casse. */
  public String externalKey() {
    return externalId.toLowerCase(Locale.ROOT);
  }

  public boolean isDeleted() {
    return deletedAt != null;
  }

  /** Le score de la fonctionnalité sur cette échelle (rang à 0 ; voir {@code Ranking}). */
  public Score score(PrioritizationMethod method, Scale scale) {
    return Score.of(method, criteria, scale);
  }

  /** Remplace les valeurs ; refuse toute valeur hors de l'échelle ({@code INVALID_VALUE}). */
  public Feature withCriteria(Criteria newCriteria, Scale scale) {
    requireInScale(newCriteria, scale);
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

  public Feature withDetails(String newTitle, String newDescription) {
    return new Feature(
        id,
        sessionId,
        externalId,
        newTitle,
        newDescription,
        criteria,
        markedForReview,
        reviewReason,
        deletedAt,
        version);
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

  /** Pose la marque « à revoir », avec un motif facultatif de 200 caractères au plus. */
  public Feature markForReview(String reason) {
    String normalized = reason == null || reason.isBlank() ? null : reason.strip();
    if (normalized != null && normalized.length() > MAX_REVIEW_REASON) {
      throw new InvalidFeatureException("Motif trop long (200 caractères au plus)");
    }
    return new Feature(
        id,
        sessionId,
        externalId,
        title,
        description,
        criteria,
        true,
        normalized,
        deletedAt,
        version);
  }

  /** Retire la marque « à revoir » et vide son motif. */
  public Feature clearReview() {
    return new Feature(
        id, sessionId, externalId, title, description, criteria, false, null, deletedAt, version);
  }

  /** Suppression douce. */
  public Feature delete(Instant at) {
    return new Feature(
        id,
        sessionId,
        externalId,
        title,
        description,
        criteria,
        markedForReview,
        reviewReason,
        Objects.requireNonNull(at, "at"),
        version);
  }

  public Feature withVersion(long newVersion) {
    return new Feature(
        id,
        sessionId,
        externalId,
        title,
        description,
        criteria,
        markedForReview,
        reviewReason,
        deletedAt,
        newVersion);
  }

  private static void requireInScale(Criteria criteria, Scale scale) {
    criteria
        .values()
        .forEach(
            (key, value) -> {
              if (!scale.accepts(value)) {
                throw new InvalidValueException(
                    "La valeur de " + key + " est hors de l'échelle (1 à " + scale.max() + ")");
              }
            });
  }

  private static String bounded(String raw, String name, int max, boolean required) {
    String value = raw == null ? "" : raw.strip();
    if (required && value.isEmpty()) {
      throw new InvalidFeatureException(name + " obligatoire");
    }
    if (value.length() > max) {
      throw new InvalidFeatureException(name + " trop long (" + max + " caractères au plus)");
    }
    return value;
  }
}
