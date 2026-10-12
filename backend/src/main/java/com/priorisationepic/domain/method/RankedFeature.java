package com.priorisationepic.domain.method;

import com.priorisationepic.domain.Feature;

/** Une fonctionnalité avec son score ; {@code score().rank()} est sa position (à partir de 1). */
public record RankedFeature(Feature feature, Score score) {}
