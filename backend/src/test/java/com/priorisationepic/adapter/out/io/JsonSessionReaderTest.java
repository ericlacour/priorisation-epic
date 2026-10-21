package com.priorisationepic.adapter.out.io;

import static com.priorisationepic.adapter.out.io.ImportFixtures.TEXTS;
import static com.priorisationepic.adapter.out.io.ImportFixtures.file;
import static com.priorisationepic.adapter.out.io.ImportFixtures.ids;
import static com.priorisationepic.adapter.out.io.ImportFixtures.messages;
import static com.priorisationepic.adapter.out.io.ImportFixtures.wsjf;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.priorisationepic.application.ImportPreview;
import com.priorisationepic.application.ImportRefusedException;
import com.priorisationepic.domain.method.WsjfMethod;
import com.priorisationepic.domain.scale.Scale;
import com.priorisationepic.domain.scale.ScaleType;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class JsonSessionReaderTest {

  private final JsonSessionReader reader = new JsonSessionReader(TEXTS, new JsonMapper());

  @Test
  void anEmptySessionInPreparationTakesTheScaleOfTheFile() {
    ImportPreview preview =
        reader.read(
            file("export-wsjf.json"),
            ImportFixtures.context(WsjfMethod.version1(), Scale.defaultScale(), true));

    assertThat(preview.sourceType()).isEqualTo(ImportPreview.SourceType.JSON);
    assertThat(preview.scale()).isEqualTo(new Scale(ScaleType.FIBONACCI, 20));
    assertThat(ids(preview.validRows())).containsExactly("F-1", "F-2", "F-3");
    assertThat(preview.validRows().getFirst().criteria())
        .containsExactly(
            Map.entry("bv", 13), Map.entry("tc", 5), Map.entry("rrOe", 3), Map.entry("js", 8));
    assertThat(preview.validRows().getFirst().description()).isEqualTo("Description");
    assertThat(ImportFixtures.reasons(preview)).containsExactly("4 null: Identifiant vide");
    // computed et rank sont recalculés ; les tours ne sont jamais réimportés.
    assertThat(messages(preview))
        .containsExactly(
            "2: Critère « effort » inconnu de la méthode : ignoré",
            "1: Rang recalculé : 2 au lieu de 1 dans le fichier",
            "2: WSJF recalculé : 6,00 au lieu de 5,00 dans le fichier",
            "0: Les tours de vote et les votes du fichier ne sont pas réimportés.");
  }

  @Test
  void otherwiseTheSessionKeepsItsScaleAndOutOfScaleValuesAreWarned() {
    ImportPreview preview = reader.read(file("export-wsjf.json"), wsjf());

    assertThat(preview.scale()).isNull();
    assertThat(preview.validRows().getFirst().criteria())
        .containsExactly(Map.entry("tc", 5), Map.entry("rrOe", 3), Map.entry("js", 8));
    assertThat(messages(preview))
        .contains(
            "1: BV = 13 hors échelle : valeur ignorée", "3: BV = 20 hors échelle : valeur ignorée");
  }

  @Test
  void aFileOfAnotherMethodIsRefusedWholeNamingBothMethods() {
    assertThatThrownBy(() -> reader.read(file("autre-methode.json"), wsjf()))
        .isInstanceOf(ImportRefusedException.class)
        .hasMessage(
            "Ce fichier a été produit avec la méthode REACH v1 ; cette session utilise WSJF v1."
                + " Importez-le dans une session qui utilise REACH v1.");
  }

  @Test
  void anotherVersionOfTheMethodIsRefusedToo() {
    String text =
        new String(file("export-wsjf.json"), StandardCharsets.UTF_8)
            .replace("\"methodVersion\": 1", "\"methodVersion\": 2");

    assertThatThrownBy(() -> reader.read(text.getBytes(StandardCharsets.UTF_8), wsjf()))
        .isInstanceOf(ImportRefusedException.class)
        .hasMessageContaining("WSJF v2 ; cette session utilise WSJF v1");
  }

  @Test
  void anUnknownFormatVersionOrAnUnreadableFileIsRefused() {
    assertThatThrownBy(() -> read("{\"formatVersion\":2,\"session\":{},\"features\":[]}"))
        .isInstanceOf(ImportRefusedException.class)
        .hasMessage(
            "Ce fichier JSON est au format 2, que l'outil ne connaît pas : importez un export JSON"
                + " produit par l'outil.");
    assertThatThrownBy(() -> read("{pas du json"))
        .isInstanceOf(ImportRefusedException.class)
        .hasMessageStartingWith("Le fichier JSON est illisible");
    assertThatThrownBy(() -> read("[1, 2]"))
        .isInstanceOf(ImportRefusedException.class)
        .hasMessageStartingWith("Le fichier JSON est illisible");
  }

  @Test
  void aBomIsAccepted() {
    byte[] content = file("export-wsjf.json");
    byte[] withBom = new byte[content.length + 3];
    withBom[0] = (byte) 0xEF;
    withBom[1] = (byte) 0xBB;
    withBom[2] = (byte) 0xBF;
    System.arraycopy(content, 0, withBom, 3, content.length);

    assertThat(reader.read(withBom, wsjf()).validRows()).hasSize(3);
  }

  @Test
  void limitsOf5MbAnd1000Features() {
    StringBuilder features = new StringBuilder();
    for (int i = 1; i <= 1001; i++) {
      features.append(i == 1 ? "" : ",").append("{\"externalId\":\"F-").append(i);
      features.append("\",\"title\":\"T\",\"criteria\":{}}");
    }
    assertThatThrownBy(() -> read(document(features.toString())))
        .isInstanceOf(ImportRefusedException.class)
        .hasMessageStartingWith("Le fichier dépasse 1 000 lignes");
    assertThatThrownBy(() -> reader.read(new byte[5 * 1024 * 1024 + 1], wsjf()))
        .isInstanceOf(ImportRefusedException.class)
        .hasMessage("Le fichier dépasse 5 Mo : découpez-le en plusieurs imports.");
  }

  private static String document(String features) {
    return "{\"formatVersion\":1,\"session\":{\"method\":\"WSJF\",\"methodVersion\":1,"
        + "\"scale\":{\"type\":\"CONTINUOUS\",\"max\":10}},\"features\":["
        + features
        + "],\"rounds\":[]}";
  }

  private ImportPreview read(String text) {
    return reader.read(text.getBytes(StandardCharsets.UTF_8), wsjf());
  }
}
