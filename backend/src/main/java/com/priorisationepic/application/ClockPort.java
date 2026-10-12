package com.priorisationepic.application;

import java.time.Instant;

/** Seule source de l'heure pour les cas d'usage. */
public interface ClockPort {

  Instant now();
}
