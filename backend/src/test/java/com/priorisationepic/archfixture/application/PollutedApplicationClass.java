package com.priorisationepic.archfixture.application;

import com.priorisationepic.archfixture.adapter.in.rest.RestAdapter;

/** Cas d'usage qui dépend d'un adaptateur : ArchitectureTest doit le refuser. */
public class PollutedApplicationClass {
  RestAdapter adapter;
}
