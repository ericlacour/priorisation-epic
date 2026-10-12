package com.priorisationepic.adapter.in.ws;

import com.priorisationepic.domain.Tokens;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Données de test : une session et ses participants, insérées directement en base. */
final class SessionFixtures {

  static final String SESSION_ID = "k3Jx9QvT2mLpZ8wR4nYb7A";
  static final String ANIMATION_TOKEN = "animation-token-of-the-facilitator";
  static final String ALICE_TOKEN = "participant-token-of-alice";
  static final String BOB_TOKEN = "participant-token-of-bob";

  private SessionFixtures() {}

  static void reset(JdbcTemplate jdbc) {
    jdbc.update("delete from session");
  }

  static UUID insertSession(JdbcTemplate jdbc) {
    jdbc.update(
        "insert into session (session_id, animation_token_hash, name, status, method,"
            + " method_version, scale_type, scale_max, created_at, created_by_pseudo)"
            + " values (?, ?, 'Atelier', 'PREPARATION', 'WSJF', 1, 'CONTINUOUS', 10, now(), 'Alice')",
        SESSION_ID,
        Tokens.hash(ANIMATION_TOKEN));
    return insertParticipant(jdbc, "Alice", ALICE_TOKEN, "FACILITATOR");
  }

  static UUID insertParticipant(JdbcTemplate jdbc, String pseudo, String token, String role) {
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
}
