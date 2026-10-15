package com.priorisationepic.application;

import com.priorisationepic.domain.Feature;
import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.ParticipantIdentity;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.SessionStatus;
import com.priorisationepic.domain.method.Criteria;
import com.priorisationepic.domain.method.MethodDefinition;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.method.PrioritizationMethod;
import com.priorisationepic.domain.scale.Scale;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Import de fonctionnalités par fichier (FR-007, FR-008), réservé à l'animateur.
 *
 * <ol>
 *   <li>L'aperçu lit le fichier et le garde 15 minutes ; rien d'autre n'est écrit.
 *   <li>La confirmation, sous le verrou de la session, ajoute les lignes valides en une seule
 *       transaction, puis diffuse l'état. Une ligne dont l'identifiant a été pris entre-temps est
 *       comptée comme rejetée ; une valeur sortie de l'échelle entre-temps est ignorée. L'échelle
 *       d'un export JSON n'est appliquée que si la session est toujours en préparation et vide ; ce
 *       changement est tracé dans l'historique.
 * </ol>
 */
public class ImportUseCase {

  /** Durée de vie d'un aperçu. */
  public static final Duration PREVIEW_LIFETIME = Duration.ofMinutes(15);

  /** Le bilan de la confirmation (FR-008). */
  public record Result(int imported, int rejected) {}

  private final SessionRepository sessions;
  private final ParticipantRepository participants;
  private final FeatureRepository features;
  private final ImportPreviewRepository previews;
  private final ImportFileReader reader;
  private final ChangeLogWriter changeLog;
  private final MethodRegistry methods;
  private final Broadcaster broadcaster;
  private final SessionLocks locks;
  private final IdGenerator ids;
  private final ClockPort clock;
  private final Transactions transactions;

  public ImportUseCase(
      SessionRepository sessions,
      ParticipantRepository participants,
      FeatureRepository features,
      ImportPreviewRepository previews,
      ImportFileReader reader,
      ChangeLogWriter changeLog,
      MethodRegistry methods,
      Broadcaster broadcaster,
      SessionLocks locks,
      IdGenerator ids,
      ClockPort clock,
      Transactions transactions) {
    this.sessions = sessions;
    this.participants = participants;
    this.features = features;
    this.previews = previews;
    this.reader = reader;
    this.changeLog = changeLog;
    this.methods = methods;
    this.broadcaster = broadcaster;
    this.locks = locks;
    this.ids = ids;
    this.clock = clock;
    this.transactions = transactions;
  }

  /**
   * Lit le fichier et garde l'aperçu.
   *
   * @throws SessionNotFoundException session inconnue
   * @throws ForbiddenException appelant sans les droits d'animateur, ou session clôturée
   * @throws ImportRefusedException fichier refusé en entier
   */
  public StoredImportPreview preview(
      String sessionId,
      String participantToken,
      String animationToken,
      String fileName,
      byte[] content) {
    Facilitator facilitator = facilitator(sessionId, participantToken, animationToken);
    Session session = facilitator.session();
    PrioritizationMethod method = method(session);
    List<Feature> active = features.listActive(session.id(), method.definition());
    ImportContext context =
        new ImportContext(
            method,
            session.scale(),
            active.stream().map(Feature::externalId).collect(Collectors.toSet()),
            replaceable(session, active.size()));
    ImportPreview preview = reader.read(fileName, content, context);
    StoredImportPreview stored =
        new StoredImportPreview(
            ids.newUuid(), session.id(), preview, clock.now().plus(PREVIEW_LIFETIME));
    previews.insert(stored);
    return stored;
  }

  /**
   * Importe les lignes valides de l'aperçu.
   *
   * @throws ImportPreviewNotFoundException aperçu inconnu, expiré ou déjà confirmé
   */
  public Result confirm(
      String sessionId, String participantToken, String animationToken, UUID previewId) {
    Facilitator facilitator = facilitator(sessionId, participantToken, animationToken);
    SessionId id = facilitator.session().id();
    return locks.withLock(
        id,
        () -> {
          // Relue sous le verrou : la session a pu changer depuis le contrôle des droits.
          Session session = sessions.find(id).orElseThrow(SessionNotFoundException::new);
          if (!session.isWritable()) {
            throw new ForbiddenException();
          }
          StoredImportPreview stored =
              previews
                  .find(id, previewId, clock.now())
                  .orElseThrow(ImportPreviewNotFoundException::new);
          ImportPreview preview = stored.preview();
          MethodDefinition definition = method(session).definition();
          List<Feature> active = features.listActive(id, definition);
          Scale scale =
              preview.scale() != null && replaceable(session, active.size())
                  ? preview.scale()
                  : session.scale();
          Set<String> taken =
              new ImportContext(
                      method(session),
                      scale,
                      active.stream().map(Feature::externalId).collect(Collectors.toSet()),
                      false)
                  .takenExternalIds();
          List<Feature> toInsert =
              preview.validRows().stream()
                  .filter(
                      row -> !taken.contains(row.externalId().toLowerCase(java.util.Locale.ROOT)))
                  .map(row -> feature(id, row, definition, scale))
                  .toList();
          int rejected =
              preview.rejectedRows().size() + preview.validRows().size() - toInsert.size();
          transactions.run(
              () -> {
                if (!scale.equals(session.scale())) {
                  sessions.updateSettings(id, session.name(), scale);
                  changeLog.scaleChanged(
                      id,
                      facilitator.identity().pseudo(),
                      session.scale().type().name(),
                      session.scale().max(),
                      scale.type().name(),
                      scale.max());
                }
                toInsert.forEach(features::insert);
                previews.delete(previewId);
                sessions.incrementVersion(id);
              });
          broadcaster.publish(id);
          return new Result(toInsert.size(), rejected);
        });
  }

  /** Supprime les aperçus expirés ; renvoie leur nombre. */
  public int purgeExpired() {
    return previews.deleteExpired(clock.now());
  }

  private record Facilitator(Session session, ParticipantIdentity identity) {}

  private Facilitator facilitator(
      String sessionId, String participantToken, String animationToken) {
    if (!SessionId.isValid(sessionId)) {
      throw new SessionNotFoundException();
    }
    SessionId id = new SessionId(sessionId);
    Session session = sessions.find(id).orElseThrow(SessionNotFoundException::new);
    if (participantToken == null
        || animationToken == null
        || !sessions.animationTokenMatches(id, animationToken)) {
      throw new ForbiddenException();
    }
    ParticipantIdentity identity =
        participants.findByToken(id, participantToken).orElseThrow(ForbiddenException::new);
    if (!session.isWritable()) {
      throw new ForbiddenException();
    }
    return new Facilitator(session, identity);
  }

  private PrioritizationMethod method(Session session) {
    return methods.get(session.method(), session.methodVersion());
  }

  /** L'échelle d'un export JSON ne remplace que celle d'une session vide en préparation. */
  private static boolean replaceable(Session session, int activeFeatures) {
    return session.status() == SessionStatus.PREPARATION && activeFeatures == 0;
  }

  /** La fonctionnalité d'une ligne ; une valeur sortie de l'échelle depuis l'aperçu est ignorée. */
  private Feature feature(
      SessionId sessionId, ImportPreview.Row row, MethodDefinition definition, Scale scale) {
    Map<String, Integer> values = new LinkedHashMap<>();
    row.criteria()
        .forEach(
            (key, value) -> {
              if (scale.accepts(value)) {
                values.put(key, value);
              }
            });
    return Feature.create(
        ids.newUuid(),
        sessionId,
        row.externalId(),
        row.title(),
        row.description(),
        Criteria.of(definition, values));
  }
}
