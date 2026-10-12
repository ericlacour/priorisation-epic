package com.priorisationepic.application;

import com.priorisationepic.domain.ChangeLogEntry;
import com.priorisationepic.domain.ChangeLogEntry.Action;
import com.priorisationepic.domain.ChangeLogEntry.EntityType;
import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.SessionId;
import java.util.Objects;
import java.util.UUID;

/**
 * Écrit l'historique (FR-025, constitution III) dans la transaction de la modification tracée.
 * Seules deux choses sont tracées : une modification de valeur retenue, uniquement si la valeur
 * change, et un changement d'échelle, uniquement si l'échelle change. Rien d'autre.
 */
public class ChangeLogWriter {

  private final ChangeLogRepository repository;
  private final ClockPort clock;
  private final IdGenerator ids;

  public ChangeLogWriter(ChangeLogRepository repository, ClockPort clock, IdGenerator ids) {
    this.repository = repository;
    this.clock = clock;
    this.ids = ids;
  }

  /**
   * Trace le changement de la valeur retenue d'un critère d'une fonctionnalité ({@code null} :
   * critère non renseigné). Sans effet si la valeur ne change pas.
   *
   * @return vrai si une entrée a été écrite
   */
  public boolean valueChanged(
      SessionId sessionId,
      Pseudo author,
      UUID featureId,
      String criterionKey,
      Integer oldValue,
      Integer newValue) {
    if (Objects.equals(oldValue, newValue)) {
      return false;
    }
    repository.append(
        new ChangeLogEntry(
            ids.newUuid(),
            sessionId,
            clock.now(),
            author,
            EntityType.FEATURE,
            featureId.toString(),
            Action.VALUE_CHANGE,
            criterionKey,
            json(oldValue),
            json(newValue)));
    return true;
  }

  /**
   * Trace le changement d'échelle de la session. Sans effet si le type et le maximum ne changent
   * pas.
   *
   * @return vrai si une entrée a été écrite
   */
  public boolean scaleChanged(
      SessionId sessionId, Pseudo author, String oldType, int oldMax, String newType, int newMax) {
    if (oldType.equals(newType) && oldMax == newMax) {
      return false;
    }
    repository.append(
        new ChangeLogEntry(
            ids.newUuid(),
            sessionId,
            clock.now(),
            author,
            EntityType.SESSION,
            sessionId.value(),
            Action.SCALE_CHANGE,
            null,
            scale(oldType, oldMax),
            scale(newType, newMax)));
    return true;
  }

  private static String json(Integer value) {
    return value == null ? null : value.toString();
  }

  private static String scale(String type, int max) {
    return "{\"type\":\"" + type + "\",\"max\":" + max + "}";
  }
}
