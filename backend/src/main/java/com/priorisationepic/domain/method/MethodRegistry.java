package com.priorisationepic.domain.method;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Les méthodes connues, par (clé, version). Toutes les versions restent connues pour les sessions
 * existantes ; seule la dernière de chaque méthode est proposée à la création.
 */
public final class MethodRegistry {

  private final Map<String, Map<Integer, PrioritizationMethod>> methods = new HashMap<>();
  private final String defaultKey;

  public MethodRegistry(List<? extends PrioritizationMethod> methods, String defaultKey) {
    for (PrioritizationMethod method : methods) {
      MethodDefinition def = method.definition();
      if (this.methods
              .computeIfAbsent(def.key(), k -> new HashMap<>())
              .putIfAbsent(def.version(), method)
          != null) {
        throw new IllegalArgumentException(
            "Méthode en double : " + def.key() + " version " + def.version());
      }
    }
    if (!this.methods.containsKey(defaultKey)) {
      throw new UnknownMethodException(String.valueOf(defaultKey));
    }
    this.defaultKey = defaultKey;
  }

  /** Le registre de l'application : WSJF, par défaut. */
  public static MethodRegistry standard() {
    return new MethodRegistry(List.of(new WsjfMethod()), WsjfMethod.KEY);
  }

  /** La méthode (clé, version), ou {@link UnknownMethodException}. */
  public PrioritizationMethod get(String key, int version) {
    Map<Integer, PrioritizationMethod> versions = key == null ? null : methods.get(key);
    PrioritizationMethod method = versions == null ? null : versions.get(version);
    if (method == null) {
      throw new UnknownMethodException(String.valueOf(key), version);
    }
    return method;
  }

  /** La dernière version de la méthode, ou {@link UnknownMethodException}. */
  public PrioritizationMethod latest(String key) {
    Map<Integer, PrioritizationMethod> versions = key == null ? null : methods.get(key);
    if (versions == null) {
      throw new UnknownMethodException(String.valueOf(key));
    }
    return versions.entrySet().stream().max(Map.Entry.comparingByKey()).orElseThrow().getValue();
  }

  /** La méthode par défaut, dans sa dernière version. */
  public PrioritizationMethod defaultMethod() {
    return latest(defaultKey);
  }

  /** Les méthodes proposées à la création : la dernière version de chacune, triées par clé. */
  public List<PrioritizationMethod> available() {
    return methods.keySet().stream().sorted().map(this::latest).toList();
  }
}
