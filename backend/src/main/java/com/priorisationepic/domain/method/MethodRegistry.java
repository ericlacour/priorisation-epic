package com.priorisationepic.domain.method;

import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Les méthodes connues, par clé et par version. Les méthodes proposées à la création sont les
 * dernières versions de chaque clé ; les anciennes versions restent connues pour les sessions qui
 * les utilisent.
 */
public final class MethodRegistry {

  private final Map<String, Map<Integer, PrioritizationMethod>> methods = new LinkedHashMap<>();

  public MethodRegistry(Collection<? extends PrioritizationMethod> registered) {
    for (PrioritizationMethod method : registered) {
      MethodDefinition definition = method.definition();
      if (methods
              .computeIfAbsent(definition.key(), key -> new LinkedHashMap<>())
              .put(definition.version(), method)
          != null) {
        throw new IllegalArgumentException(
            "Méthode déclarée deux fois : " + definition.key() + " v" + definition.version());
      }
    }
  }

  /**
   * Le registre standard : WSJF version 1, gardée pour les sessions créées avec elle, et WSJF
   * version 2, proposée aux nouvelles sessions.
   */
  public static MethodRegistry standard() {
    return new MethodRegistry(List.of(WsjfMethod.version1(), WsjfMethod.version2()));
  }

  /** La méthode de cette version, ou {@link UnknownMethodException}. */
  public PrioritizationMethod get(String key, int version) {
    return find(key, version).orElseThrow(() -> new UnknownMethodException(key, version));
  }

  public Optional<PrioritizationMethod> find(String key, int version) {
    return Optional.ofNullable(methods.get(key)).map(versions -> versions.get(version));
  }

  /** La dernière version de la méthode, ou {@link UnknownMethodException}. */
  public PrioritizationMethod latest(String key) {
    Map<Integer, PrioritizationMethod> versions = methods.get(key);
    if (versions == null) {
      throw new UnknownMethodException(key, null);
    }
    return versions.entrySet().stream()
        .max(Map.Entry.comparingByKey(Comparator.naturalOrder()))
        .orElseThrow()
        .getValue();
  }

  /** La méthode proposée par défaut à la création : WSJF. */
  public PrioritizationMethod defaultMethod() {
    return latest(WsjfMethod.KEY);
  }

  /** Les méthodes proposées à la création, chacune dans sa dernière version. */
  public List<PrioritizationMethod> available() {
    return methods.keySet().stream().map(this::latest).toList();
  }
}
