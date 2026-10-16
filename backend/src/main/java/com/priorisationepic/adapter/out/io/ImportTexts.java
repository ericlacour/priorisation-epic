package com.priorisationepic.adapter.out.io;

import com.priorisationepic.application.ImportRefusedException;
import java.util.Locale;
import org.springframework.context.MessageSource;
import org.springframework.stereotype.Component;

/**
 * Les textes de l'import et des exports, lus dans {@code messages.properties} (catalogue unique,
 * FR-027).
 */
@Component
public class ImportTexts {

  private static final Locale FRENCH = Locale.FRENCH;

  private final MessageSource messages;

  public ImportTexts(MessageSource messages) {
    this.messages = messages;
  }

  /** Le texte de la clé ; les paramètres sont des textes, jamais mis en forme. */
  public String text(String key, String... args) {
    return messages.getMessage(key, args.length == 0 ? null : args, FRENCH);
  }

  /** Le refus du fichier entier, avec le texte de la clé. */
  public ImportRefusedException refused(String key, String... args) {
    return new ImportRefusedException(text(key, args));
  }
}
