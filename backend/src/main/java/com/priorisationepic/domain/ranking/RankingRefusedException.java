package com.priorisationepic.domain.ranking;

import java.util.UUID;

/** Une intention sur la salle de classement est refusée : rien n'a changé. */
public final class RankingRefusedException extends RuntimeException {

  /** Le motif du refus. */
  public enum Reason {
    /** Brouillon mal formé : critère en cours hors des critères choisis, niveau vide… */
    INVALID_DRAFT,
    /** Une fonctionnalité apparaît plusieurs fois dans le brouillon. */
    DUPLICATE_FEATURE,
    /** Un critère que la méthode de la session ne déclare pas. */
    UNKNOWN_CRITERION,
    /** Une valeur hors de l'échelle de la session. */
    VALUE_OUT_OF_SCALE,
    /** Une fonctionnalité d'un tour de vote ouvert (FR-018). */
    FEATURE_IN_OPEN_ROUND,
    /** Une fonctionnalité ou un critère hors du brouillon en cours. */
    NOT_IN_RANKING,
    /** Un commentaire de plus de 140 caractères. */
    COMMENT_TOO_LONG,
    /**
     * Une valeur souhaitée avec « D'accord » : seuls « Je monterais » et « Je descendrais » en ont.
     */
    VALUE_WITHOUT_MOVE,
    /** Un avis sur une carte où la salle s'est mise d'accord : on n'y revient pas. */
    CARD_AGREED
  }

  private final Reason reason;
  private final transient UUID featureId;

  public RankingRefusedException(Reason reason) {
    this(reason, null);
  }

  public RankingRefusedException(Reason reason, UUID featureId) {
    super(reason.name());
    this.reason = reason;
    this.featureId = featureId;
  }

  public Reason reason() {
    return reason;
  }

  /** La fonctionnalité concernée, ou {@code null}. */
  public UUID featureId() {
    return featureId;
  }
}
