package com.priorisationepic.adapter.in.rest;

import static org.assertj.core.api.Assertions.assertThat;

import com.priorisationepic.ContractExamples;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.ServletRequest;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.MessageSource;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.util.unit.DataSize;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** Corps REST limité sur les routes {@code POST} ; plus large pour les imports. */
class RequestBodyLimitFilterTest {

  private static final int LIMIT = 2048;
  private static final int IMPORT_LIMIT = 8192;

  private static MessageSource messages() {
    ResourceBundleMessageSource source = new ResourceBundleMessageSource();
    source.setBasename("messages");
    source.setDefaultEncoding("UTF-8");
    return source;
  }

  private final JsonMapper jsonMapper = JsonMapper.builder().build();
  private final RequestBodyLimitFilter filter =
      new RequestBodyLimitFilter(
          DataSize.ofBytes(LIMIT), DataSize.ofBytes(IMPORT_LIMIT), jsonMapper, messages());
  ;

  /**
   * Corps dont on compte les octets lus ; {@code declaredLength} -1 : sans {@code Content-Length}.
   */
  private static final class ChunkedRequest extends MockHttpServletRequest {
    final AtomicInteger read = new AtomicInteger();
    private final ByteArrayInputStream source;
    private final long declaredLength;

    ChunkedRequest(String uri, byte[] body, long declaredLength) {
      super("POST", uri);
      this.source = new ByteArrayInputStream(body);
      this.declaredLength = declaredLength;
    }

    @Override
    public long getContentLengthLong() {
      return declaredLength;
    }

    @Override
    public int getContentLength() {
      return (int) declaredLength;
    }

    @Override
    public ServletInputStream getInputStream() {
      return new ServletInputStream() {
        @Override
        public int read() {
          int b = source.read();
          if (b >= 0) {
            read.incrementAndGet();
          }
          return b;
        }

        @Override
        public boolean isFinished() {
          return source.available() == 0;
        }

        @Override
        public boolean isReady() {
          return true;
        }

        @Override
        public void setReadListener(ReadListener listener) {
          throw new UnsupportedOperationException();
        }
      };
    }
  }

  /**
   * Passe la requête au filtre ; renvoie le corps vu par la suite de la chaîne, ou {@code null} si
   * refusée.
   */
  private String filter(MockHttpServletRequest request, MockHttpServletResponse response)
      throws Exception {
    AtomicReference<String> seen = new AtomicReference<>();
    filter.doFilter(
        request,
        response,
        (ServletRequest req, jakarta.servlet.ServletResponse res) -> {
          try {
            seen.set(new String(req.getInputStream().readAllBytes(), StandardCharsets.UTF_8));
          } catch (IOException e) {
            throw new IllegalStateException(e);
          }
        });
    return seen.get();
  }

  private static int limitOf(String path) {
    return path.endsWith("/imports")
        ? (int) (IMPORT_LIMIT + RequestBodyLimitFilter.MULTIPART_OVERHEAD)
        : LIMIT;
  }

  private static String bodyOf(int bytes) {
    String json = "{\"pseudo\":\"Alice\"}";
    return json + " ".repeat(bytes - json.length());
  }

  private void assertPayloadTooLarge(MockHttpServletResponse response, String path)
      throws Exception {
    assertThat(response.getStatus()).isEqualTo(413);
    assertThat(response.getContentType()).startsWith("application/problem+json");
    ObjectNode expected =
        (ObjectNode) jsonMapper.readTree(ContractExamples.read("problem", "payload-too-large"));
    expected.put("instance", path);
    JsonNode actual = jsonMapper.readTree(response.getContentAsString());
    assertThat(actual).isEqualTo(expected);
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "/api/sessions",
        "/api/sessions/k3Jx9QvT2mLpZ8wR4nYb7A/participants",
        "/api/sessions/k3Jx9QvT2mLpZ8wR4nYb7A/imports"
      })
  void aDeclaredLengthOverTheLimitIsRefusedWithoutReading(String path) throws Exception {
    int limit = limitOf(path);
    ChunkedRequest request =
        new ChunkedRequest(path, bodyOf(limit + 1).getBytes(StandardCharsets.UTF_8), limit + 1);
    MockHttpServletResponse response = new MockHttpServletResponse();

    assertThat(filter(request, response)).isNull();

    assertPayloadTooLarge(response, path);
    assertThat(request.read).hasValue(0);
  }

  @ParameterizedTest
  @ValueSource(strings = {"/api/sessions", "/api/sessions/k3Jx9QvT2mLpZ8wR4nYb7A/participants"})
  void aChunkedBodyOverTheLimitIsRefusedAfterReadingAtMostTheLimitPlusOne(String path)
      throws Exception {
    ChunkedRequest request = new ChunkedRequest(path, new byte[20 * 1024], -1);
    MockHttpServletResponse response = new MockHttpServletResponse();

    assertThat(filter(request, response)).isNull();

    assertPayloadTooLarge(response, path);
    assertThat(request.read.get()).isLessThanOrEqualTo(limitOf(path) + 1);
  }

  /** Le conteneur décode lui-même le formulaire d'import : le filtre n'en lit rien. */
  @Test
  void anImportWithinTheLimitIsPassedOnUnread() throws Exception {
    String path = "/api/sessions/k3Jx9QvT2mLpZ8wR4nYb7A/imports";
    byte[] body = new byte[20 * 1024];
    ChunkedRequest request = new ChunkedRequest(path, body, body.length);
    MockHttpServletResponse response = new MockHttpServletResponse();

    assertThat(filter(request, response)).hasSize(body.length);
    assertThat(response.getStatus()).isEqualTo(200);
  }

  @Test
  void aBodyAtTheLimitIsPassedOnUnchanged() throws Exception {
    String body = bodyOf(LIMIT);
    ChunkedRequest request =
        new ChunkedRequest("/api/sessions", body.getBytes(StandardCharsets.UTF_8), -1);
    MockHttpServletResponse response = new MockHttpServletResponse();

    assertThat(filter(request, response)).isEqualTo(body);
    assertThat(response.getStatus()).isEqualTo(200);
  }

  @Test
  void otherRoutesAreNotLimited() throws Exception {
    for (String[] route :
        new String[][] {
          {"GET", "/api/sessions/k3Jx9QvT2mLpZ8wR4nYb7A"},
          {"POST", "/api/health"},
          {"POST", "/api/sessions/k3Jx9QvT2mLpZ8wR4nYb7A/imports/x/confirm"},
          {"POST", "/api/sessions/k3Jx9QvT2mLpZ8wR4nYb7A"},
          {"PUT", "/api/sessions"}
        }) {
      MockHttpServletRequest request = new MockHttpServletRequest(route[0], route[1]);
      request.setContent(new byte[20 * 1024]);
      MockHttpServletResponse response = new MockHttpServletResponse();
      assertThat(filter(request, response)).hasSize(20 * 1024);
      assertThat(response.getStatus()).isEqualTo(200);
    }
  }
}
