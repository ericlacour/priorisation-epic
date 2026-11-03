package com.priorisationepic.adapter.in.ws;

import com.priorisationepic.application.Broadcaster;
import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.Tokens;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Données de test : une session et ses participants, insérées directement en base. */
public final class SessionFixtures {

  public static final String SESSION_ID = "k3Jx9QvT2mLpZ8wR4nYb7A";
  public static final String ANIMATION_TOKEN = "animation-token-of-the-facilitator";
  public static final String ALICE_TOKEN = "participant-token-of-alice";
  public static final String BOB_TOKEN = "participant-token-of-bob";

  private SessionFixtures() {}

  public static void reset(JdbcTemplate jdbc) {
    jdbc.update("delete from session");
  }

  public static UUID insertSession(JdbcTemplate jdbc) {
    jdbc.update(
        "insert into session (session_id, animation_token_hash, name, status, method,"
            + " method_version, scale_type, scale_max, created_at, created_by_pseudo)"
            + " values (?, ?, 'Atelier', 'PREPARATION', 'WSJF', 1, 'CONTINUOUS', 10, now(), 'Alice')",
        SESSION_ID,
        Tokens.hash(ANIMATION_TOKEN));
    return insertParticipant(jdbc, "Alice", ALICE_TOKEN, "FACILITATOR");
  }

  public static UUID insertParticipant(
      JdbcTemplate jdbc, String pseudo, String token, String role) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "insert into participant (id, session_id, pseudo, role, participant_token_hash, joined_at,"
            + " last_seen_at) values (?, ?, ?, ?, ?, now() - interval '1 hour', now() - interval '1 hour')",
        id,
        SESSION_ID,
        pseudo,
        role,
        Tokens.hash(token));
    return id;
  }

  /**
   * Coupe les connexions d'un test, puis attend que le serveur les ait toutes détachées. Le serveur
   * traite une fermeture en différé : sans cette attente, la déconnexion tardive d'un participant
   * du test précédent publie un {@code sessionState} de plus aux connexions du test suivant (même
   * session), qui le prennent pour la réponse attendue. Le détachement et cette publication se font
   * sous le verrou de la session, que prend aussi l'ouverture d'une connexion : une fois les
   * participants détachés, plus rien du test précédent n'atteint le suivant.
   */
  public static void closeAndAwaitDetached(
      List<WsTestClient> clients, JdbcTemplate jdbc, Broadcaster broadcaster)
      throws InterruptedException {
    clients.forEach(WsTestClient::abort);
    SessionId session = new SessionId(SESSION_ID);
    List<UUID> participants =
        jdbc.queryForList(
            "select id from participant where session_id = ?", UUID.class, SESSION_ID);
    long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
    while (participants.stream().anyMatch(id -> broadcaster.hasConnection(session, id))) {
      if (System.nanoTime() > deadline) {
        throw new AssertionError("Connexions encore rattachées côté serveur après 5 s");
      }
      Thread.sleep(10);
    }
  }
}
