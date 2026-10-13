package com.priorisationepic.adapter.in.rest;

import com.priorisationepic.domain.method.MethodDefinition;
import com.priorisationepic.domain.method.MethodRegistry;
import com.priorisationepic.domain.method.PrioritizationMethod;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/methods} (listMethods) : les méthodes proposées à la création, chacune dans sa
 * dernière version, avec leur définition complète (FR-017c, FR-017d).
 */
@RestController
public class MethodController {

  private final MethodRegistry methods;

  public MethodController(MethodRegistry methods) {
    this.methods = methods;
  }

  @GetMapping("/api/methods")
  List<MethodDefinition> listMethods() {
    return methods.available().stream().map(PrioritizationMethod::definition).toList();
  }
}
