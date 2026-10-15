package com.priorisationepic.adapter.out.io;

import com.priorisationepic.application.ImportContext;
import com.priorisationepic.application.ImportPreview;
import com.priorisationepic.domain.method.PrioritizationMethod;
import com.priorisationepic.domain.method.WsjfMethod;
import com.priorisationepic.domain.scale.Scale;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Set;
import org.springframework.context.support.ResourceBundleMessageSource;

/** Fichiers de {@code src/test/resources/imports/}, textes et contexte d'import des tests. */
final class ImportFixtures {

  static final ImportTexts TEXTS = texts();

  private ImportFixtures() {}

  private static ImportTexts texts() {
    ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
    messages.setBasename("messages");
    messages.setDefaultEncoding("UTF-8");
    messages.setFallbackToSystemLocale(false);
    return new ImportTexts(messages);
  }

  static byte[] file(String name) {
    try (InputStream in = ImportFixtures.class.getResourceAsStream("/imports/" + name)) {
      if (in == null) {
        throw new IllegalArgumentException("Fichier de test absent : " + name);
      }
      return in.readAllBytes();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  /** Session WSJF v1, échelle 1 à 10, avec l'identifiant {@code F-EXIST} déjà utilisé. */
  static ImportContext wsjf() {
    return context(WsjfMethod.version1(), Scale.defaultScale(), false);
  }

  static ImportContext context(PrioritizationMethod method, Scale scale, boolean replaceable) {
    return new ImportContext(method, scale, Set.of("F-EXIST"), replaceable);
  }

  static List<String> ids(List<ImportPreview.Row> rows) {
    return rows.stream().map(ImportPreview.Row::externalId).toList();
  }

  static List<String> messages(ImportPreview preview) {
    return preview.warnings().stream().map(w -> w.line() + ": " + w.message()).toList();
  }

  static List<String> reasons(ImportPreview preview) {
    return preview.rejectedRows().stream()
        .map(r -> r.line() + " " + r.externalId() + ": " + r.reason())
        .toList();
  }
}
