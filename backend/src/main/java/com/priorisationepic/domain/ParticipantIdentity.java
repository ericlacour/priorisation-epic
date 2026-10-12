package com.priorisationepic.domain;

import java.util.UUID;

/** Un participant reconnu par son jeton : identifiant, pseudo et rôle enregistré. */
public record ParticipantIdentity(UUID id, Pseudo pseudo, Role role) {}
