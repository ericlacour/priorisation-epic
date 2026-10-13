package com.priorisationepic.application;

import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.Participant;
import com.priorisationepic.domain.Pseudo;
import com.priorisationepic.domain.Session;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.Tokens;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.method.PrioritizationMethod;
import com.priorisationepic.domain.scale.Scale;
import java.time.Instant;

/**
 * Création d'une session (FR-001, FR-002, FR-017) : le créateur devient l'animateur et reçoit un
 * jeton de participant et un jeton d'animation, dont seules les empreintes sont gardées. La session
 * reçoit la méthode demandée (WSJF par défaut) dans sa dernière version, puis la garde.
 */
public class CreateSessionUseCase {

  /** Demande de création ; {@code method} et {@code scale} sont facultatifs. */
  public record Command(String name, String pseudo, String method, Scale scale) {}

  /** Les deux jetons ne sont rendus qu'ici, une seule fois. */
  public record Created(SessionId sessionId, String participantToken, String animationToken) {

    @Override
    public String toString() {
      return "Created[" + sessionId + ", ***]";
    }
  }

  private final SessionRepository sessions;
  private final ParticipantRepository participants;
  private final MethodRegistry methods;
  private final IdGenerator ids;
  private final ClockPort clock;
  private final Transactions transactions;

  public CreateSessionUseCase(
      SessionRepository sessions,
      ParticipantRepository participants,
      MethodRegistry methods,
      IdGenerator ids,
      ClockPort clock,
      Transactions transactions) {
    this.sessions = sessions;
    this.participants = participants;
    this.methods = methods;
    this.ids = ids;
    this.clock = clock;
    this.transactions = transactions;
  }

  /**
   * @throws com.priorisationepic.domain.InvalidPseudoException pseudo invalide
   * @throws com.priorisationepic.domain.method.UnknownMethodException méthode inconnue
   * @throws IllegalArgumentException nom invalide
   */
  public Created create(Command command) {
    Pseudo pseudo = Pseudo.of(command.pseudo());
    PrioritizationMethod method =
        command.method() == null ? methods.defaultMethod() : methods.latest(command.method());
    Scale scale = command.scale() == null ? Scale.defaultScale() : command.scale();
    Instant now = clock.now();
    SessionId sessionId = ids.newSessionId();
    String participantToken = ids.newToken();
    String animationToken = ids.newToken();
    Session session = Session.create(sessionId, command.name(), method, scale, pseudo, now);
    Participant facilitator =
        Participant.facilitator(
            ids.newUuid(), sessionId, pseudo, Tokens.hash(participantToken), now);
    transactions.run(
        () -> {
          sessions.insert(session, Tokens.hash(animationToken));
          participants.insert(facilitator);
        });
    return new Created(sessionId, participantToken, animationToken);
  }
}
