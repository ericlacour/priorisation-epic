package com.priorisationepic.application;

import java.util.UUID;

/**
 * Qui agit : le participant rattaché à la connexion, avec les droits d'animateur de cette
 * connexion.
 */
public record Actor(UUID participantId, boolean facilitator) {}
