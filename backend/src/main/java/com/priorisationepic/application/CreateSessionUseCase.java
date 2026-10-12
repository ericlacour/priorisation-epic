package com.priorisationepic.application;

import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.Role;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.Tokens;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.scale.Scale;

/**
 * Création d'une session (FR-001, FR-002) : le créateur en devient l'animateur et reçoit deux
 * jetons, l'un de participant et l'autre d'animation. Seules leurs empreintes sont enregistrées :
 * les jetons eux-mêmes ne sont renvoyés qu'une fois, et ne sont jamais journalisés. La méthode est
 * celle demandée (ou celle par défaut), dans sa dernière version, puis figée pour la session
 * (FR-017).
 */
public class CreateSessionUseCase {

  /**
   * Demande de création. {@code methodKey} et {@code scale} nuls : méthode et échelle par défaut.
   */
  public record Command(String name, String pseudo, String methodKey, Scale scale) {}

  /** Session créée et jetons en clair, à ne pas conserver. */
  public record Created(SessionId sessionId, String participantToken, String animationToken) {

    /** Jamais les jetons dans un journal. */
    @Override
    public String toString() {
      return "Created[" + sessionId + "]";
    }
  }

  private final MethodRegistry methods;
  private final SessionRepository sessions;
  private final ParticipantRepository participants;
  private final Transactions transactions;
  private final ClockPort clock;
  private final IdGenerator ids;

  public CreateSessionUseCase(
      MethodRegistry methods,
      SessionRepository sessions,
      ParticipantRepository participants,
      Transactions transactions,
      ClockPort clock,
      IdGenerator ids) {
    this.methods = methods;
    this.sessions = sessions;
    this.participants = participants;
    this.transactions = transactions;
    this.clock = clock;
    this.ids = ids;
  }

  /**
   * @throws com.priorisationepic.domain.InvalidSessionException nom vide ou de plus de 120
   *     caractères
   * @throws com.priorisationepic.domain.InvalidPseudoException pseudo vide ou de plus de 40
   *     caractères
   * @throws com.priorisationepic.domain.method.UnknownMethodException méthode inconnue
   */
  public Created create(Command command) {
    Pseudo pseudo = Pseudo.of(command.pseudo());
    SessionId sessionId = ids.newSessionId();
    String participantToken = ids.newToken();
    String animationToken = ids.newToken();
    var now = clock.now();
    Session created =
        Session.create(
            methods,
            sessionId,
            command.name(),
            command.methodKey(),
            Tokens.hash(animationToken),
            pseudo,
            now);
    Session session = command.scale() == null ? created : created.withScale(command.scale());
    transactions.inTransaction(
        () -> {
          sessions.insert(session);
          participants.insert(
              Participant.join(
                  ids.newUuid(),
                  sessionId,
                  pseudo,
                  Role.FACILITATOR,
                  Tokens.hash(participantToken),
                  now));
          return null;
        });
    return new Created(sessionId, participantToken, animationToken);
  }
}
