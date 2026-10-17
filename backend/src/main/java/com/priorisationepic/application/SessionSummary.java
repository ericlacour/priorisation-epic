package com.priorisationepic.application;

import com.priorisationepic.domain.SessionId;
import com.priorisationepic.domain.SessionStatus;
import java.time.Instant;

/**
 * Une ligne de la liste des sessions (FR-026) : {@code facilitatorPseudo} est le pseudo de
 * l'animateur actuel, à défaut celui du créateur.
 */
public record SessionSummary(
    SessionId sessionId,
    String name,
    String facilitatorPseudo,
    Instant createdAt,
    SessionStatus status,
    String method,
    int methodVersion) {}
