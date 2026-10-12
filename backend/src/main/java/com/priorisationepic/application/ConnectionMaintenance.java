package com.priorisationepic.application;

import java.time.Duration;

/**
 * Entretien périodique des connexions ouvertes : signe de vie du serveur ({@code tick}), ping de
 * protocole et fermeture des connexions silencieuses. Appelé par les tâches planifiées.
 */
public interface ConnectionMaintenance {

  /** Envoie {@code tick} à toutes les connexions rattachées. */
  void sendTicks();

  /** Envoie un ping de protocole à toutes les connexions rattachées. */
  void sendPings();

  /**
   * Ferme les connexions sans message ni pong depuis plus de {@code timeout}.
   *
   * @return le nombre de connexions fermées
   */
  int closeIdle(Duration timeout);
}
