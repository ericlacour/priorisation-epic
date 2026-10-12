package com.priorisationepic.domain.method;

/** Une valeur calculée : fraction exacte et texte affiché selon le {@link Display} de la clé. */
public record ComputedValue(Fraction exact, String display) {}
