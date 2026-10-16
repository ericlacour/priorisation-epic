package com.priorisationepic.application;

import java.util.Objects;

/** Un fichier exporté : son nom versionné, son type de contenu et ses octets. */
public final class ExportFile {

  private final String fileName;
  private final String contentType;
  private final byte[] content;

  public ExportFile(String fileName, String contentType, byte[] content) {
    this.fileName = Objects.requireNonNull(fileName, "fileName");
    this.contentType = Objects.requireNonNull(contentType, "contentType");
    this.content = Objects.requireNonNull(content, "content").clone();
  }

  public String fileName() {
    return fileName;
  }

  public String contentType() {
    return contentType;
  }

  /** Une copie des octets du fichier. */
  public byte[] content() {
    return content.clone();
  }
}
