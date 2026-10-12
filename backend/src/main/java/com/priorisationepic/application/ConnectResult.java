package com.priorisationepic.application;

import java.util.UUID;

/** Issue de la poignée de main {@code hello}. */
public sealed interface ConnectResult {

  /** Session inconnue (ou identifiant mal formé) : fermeture {@code 4404}. */
  record SessionNotFound() implements ConnectResult {}

  /** Jeton de participant inconnu : fermeture {@code 4401}. */
  record UnknownToken() implements ConnectResult {}

  /** La connexion s'est fermée pendant la poignée de main. */
  record ConnectionClosed() implements ConnectResult {}

  /**
   * Connexion rattachée. {@code facilitator} : le jeton d'animation était valide. {@code
   * animationRejected} : un jeton d'animation a été présenté mais il est invalide, la connexion
   * reste celle d'un participant ordinaire et reçoit {@code error FORBIDDEN}.
   */
  record Connected(UUID participantId, boolean facilitator, boolean animationRejected)
      implements ConnectResult {}
}
