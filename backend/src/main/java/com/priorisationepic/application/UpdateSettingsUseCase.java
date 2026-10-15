package com.priorisationepic.application;

import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.method.MethodDefinition;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.domain.scale.ScaleType;
import java.util.List;
import java.util.UUID;

/**
 * Intention {@code updateSettings} (FR-010, FR-011) : renommer la session et changer son échelle.
 * Réservée à l'animateur, exécutée sous le verrou de la session. Un changement d'échelle qui met
 * des valeurs retenues hors échelle est refusé par {@code SCALE_IMPACT} avec la liste des valeurs
 * impactées, sauf avec {@code confirm} : il est alors appliqué, et ces valeurs, gardées telles
 * quelles, sont signalées « hors échelle » (la fonctionnalité sort du calcul jusqu'à correction).
 * Le changement d'échelle est tracé dans l'historique, dans la même transaction ; le nom ne l'est
 * pas.
 */
public class UpdateSettingsUseCase {

  /**
   * {@code name} ou {@code scaleType} et {@code scaleMax} valent {@code null} s'ils sont absents.
   */
  public record Command(String name, ScaleType scaleType, Integer scaleMax, boolean confirm) {}

  private final SessionRepository sessions;
  private final ParticipantRepository participants;
  private final FeatureRepository features;
  private final ChangeLogWriter changeLog;
  private final MethodRegistry methods;
  private final Broadcaster broadcaster;
  private final SessionLocks locks;
  private final Transactions transactions;

  public UpdateSettingsUseCase(
      SessionRepository sessions,
      ParticipantRepository participants,
      FeatureRepository features,
      ChangeLogWriter changeLog,
      MethodRegistry methods,
      Broadcaster broadcaster,
      SessionLocks locks,
      Transactions transactions) {
    this.sessions = sessions;
    this.participants = participants;
    this.features = features;
    this.changeLog = changeLog;
    this.methods = methods;
    this.broadcaster = broadcaster;
    this.locks = locks;
    this.transactions = transactions;
  }

  public void update(
      SessionId sessionId, UUID participantId, boolean facilitator, Command command) {
    locks.withLock(
        sessionId,
        () -> {
          if (!facilitator) {
            throw new IntentRejectedException(ErrorCode.FORBIDDEN);
          }
          Session before = sessions.find(sessionId).orElseThrow(SessionNotFoundException::new);
          if (!before.isWritable()) {
            throw new IntentRejectedException(ErrorCode.SESSION_CLOSED);
          }
          Participant author =
              participants
                  .findById(participantId)
                  .orElseThrow(() -> new IntentRejectedException(ErrorCode.FORBIDDEN));
          Session after = settings(before, command);
          if (after.equals(before)) {
            // Rien ne change : l'état est renvoyé pour que le client sache sa demande traitée.
            broadcaster.publish(sessionId);
            return null;
          }
          boolean scaleChanged = !after.scale().equals(before.scale());
          if (scaleChanged && !command.confirm()) {
            MethodDefinition method =
                methods.get(before.method(), before.methodVersion()).definition();
            List<Feature> active = features.listActive(sessionId, method);
            List<Scale.Impact> impacts = before.scale().impactOf(after.scale(), active);
            if (!impacts.isEmpty()) {
              throw IntentRejectedException.scaleImpact(impacts);
            }
          }
          transactions.run(
              () -> {
                sessions.updateSettings(sessionId, after.name(), after.scale());
                if (scaleChanged) {
                  changeLog.scaleChanged(
                      sessionId,
                      author.pseudo(),
                      before.scale().type().name(),
                      before.scale().max(),
                      after.scale().type().name(),
                      after.scale().max());
                }
                sessions.incrementVersion(sessionId);
              });
          broadcaster.publish(sessionId);
          return null;
        });
  }

  /** La session avec le nom et l'échelle demandés ; une valeur invalide est refusée. */
  private static Session settings(Session session, Command command) {
    String name = command.name() == null ? session.name() : command.name();
    Scale scale = session.scale();
    if (command.scaleType() != null || command.scaleMax() != null) {
      if (command.scaleType() == null || command.scaleMax() == null) {
        throw new IntentRejectedException(ErrorCode.INVALID_MESSAGE);
      }
      try {
        scale = new Scale(command.scaleType(), command.scaleMax());
      } catch (IllegalArgumentException e) {
        throw new IntentRejectedException(ErrorCode.INVALID_VALUE);
      }
    }
    try {
      return session.withSettings(name, scale);
    } catch (IllegalArgumentException e) {
      throw new IntentRejectedException(ErrorCode.INVALID_MESSAGE);
    }
  }
}
