package com.priorisationepic.adapter.in.rest;

import com.priorisationepic.domain.method.MethodDefinition;
import com.priorisationepic.domain.method.MethodRegistry;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Méthodes proposées à la création d'une session, chacune dans sa dernière version (contrat :
 * listMethods, FR-017c, FR-017d). La première est celle que le formulaire présélectionne.
 */
@RestController
public class MethodController {

  private final MethodRegistry registry;

  public MethodController(MethodRegistry registry) {
    this.registry = registry;
  }

  @GetMapping("/api/methods")
  public List<MethodDefinition> list() {
    return registry.available().stream().map(m -> m.definition()).toList();
  }
}
