package com.priorisationepic.domain;

/**
 * Statut d'une session ; seul l'animateur le change (FR-004) :
 *
 * <pre>
 * PREPARATION ──START──▶ IN_PROGRESS ──CLOSE──▶ CLOSED
 *                             ▲                    │
 *                             └──────REOPEN────────┘
 * </pre>
 *
 * <p>Une action qui ne change rien ({@code START} sur une session en cours, {@code REOPEN} sur une
 * session qui n'est pas clôturée) est acceptée sans effet. En {@code CLOSED}, la session est en
 * lecture seule : seule {@code REOPEN} est permise.
 */
public enum SessionStatus {
  PREPARATION,
  IN_PROGRESS,
  CLOSED;

  /** Action de l'intention {@code changeStatus}. */
  public enum Action {
    START,
    CLOSE,
    REOPEN
  }

  /** Les écritures sont refusées en {@code CLOSED}, sauf « rouvrir » (FR-026). */
  public boolean allowsWrites() {
    return this != CLOSED;
  }

  /**
   * Le statut après {@code action}.
   *
   * @throws TransitionRefusedException si l'action n'est pas possible depuis ce statut
   */
  public SessionStatus after(Action action) {
    return switch (action) {
      case START -> {
        requireWritable();
        yield this == PREPARATION ? IN_PROGRESS : this;
      }
      case CLOSE -> {
        requireWritable();
        if (this == PREPARATION) {
          throw new TransitionRefusedException(TransitionRefusedException.Reason.NOT_STARTED);
        }
        yield CLOSED;
      }
      case REOPEN -> this == CLOSED ? IN_PROGRESS : this;
    };
  }

  private void requireWritable() {
    if (!allowsWrites()) {
      throw new TransitionRefusedException(TransitionRefusedException.Reason.CLOSED);
    }
  }

  /** Une action de statut impossible depuis le statut courant ; rien ne change. */
  public static final class TransitionRefusedException extends RuntimeException {

    /** Pourquoi : la session est clôturée, ou elle n'a pas encore démarré. */
    public enum Reason {
      CLOSED,
      NOT_STARTED
    }

    private final Reason reason;

    TransitionRefusedException(Reason reason) {
      super(reason.name());
      this.reason = reason;
    }

    public Reason reason() {
      return reason;
    }
  }
}
