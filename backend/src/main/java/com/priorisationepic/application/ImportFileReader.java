package com.priorisationepic.application;

/** Lecture d'un fichier importé : Excel, CSV ou export JSON de l'outil (FR-007). */
public interface ImportFileReader {

  /**
   * L'aperçu de {@code content}, dont le format est déduit de {@code fileName}.
   *
   * @throws ImportRefusedException si le fichier est refusé en entier (illisible, vide, trop gros,
   *     sans les colonnes obligatoires, ou export d'une autre méthode)
   */
  ImportPreview read(String fileName, byte[] content, ImportContext context);
}
