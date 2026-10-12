package com.priorisationepic.application;

import java.util.UUID;

/**
 * Issue d'une intention. {@code Accepted} : l'intention est satisfaite ; {@code changed} dit si
 * elle a modifié l'état (et donc s'il faut le diffuser). {@code Rejected} : rien n'a changé,
 * l'émetteur reçoit {@code error}, avec la fonctionnalité visée quand elle est connue.
 */
public sealed interface Outcome {

  Accepted CHANGED = new Accepted(true);
  Accepted UNCHANGED = new Accepted(false);

  record Accepted(boolean changed) implements Outcome {}

  record Rejected(ErrorCode code, UUID featureId) implements Outcome {

    public static Rejected of(ErrorCode code) {
      return new Rejected(code, null);
    }
  }
}
