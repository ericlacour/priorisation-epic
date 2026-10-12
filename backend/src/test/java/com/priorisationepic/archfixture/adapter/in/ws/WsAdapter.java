package com.priorisationepic.archfixture.adapter.in.ws;

import com.priorisationepic.archfixture.adapter.in.rest.RestAdapter;

/** Adaptateur WebSocket qui dépend de l'adaptateur REST : ArchitectureTest doit le refuser. */
public class WsAdapter {
  RestAdapter other;
}
