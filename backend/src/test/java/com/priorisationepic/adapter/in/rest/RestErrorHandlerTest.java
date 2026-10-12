package com.priorisationepic.adapter.in.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.priorisationepic.ContractExamples;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** Les erreurs REST sont des Problem Details en français, conformes aux exemples du contrat. */
class RestErrorHandlerTest {

  record Body(String name) {}

  @RestController
  static class Probe {
    @PostMapping("/probe")
    void post(@RequestBody Body body) {}

    @GetMapping("/probe/limit")
    void limit() {
      throw new TooManyCreationsException(42);
    }

    @GetMapping("/probe/malformed")
    void malformed() {
      throw new MalformedRequestException();
    }
  }

  private final JsonMapper jsonMapper = JsonMapper.builder().build();
  private final MockMvc mvc = mvc();

  private static MockMvc mvc() {
    ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
    messages.setBasename("messages");
    messages.setDefaultEncoding("UTF-8");
    return MockMvcBuilders.standaloneSetup(new Probe())
        .setControllerAdvice(new RestErrorHandler(messages))
        .build();
  }

  private JsonNode example(String name) throws Exception {
    ObjectNode node = (ObjectNode) jsonMapper.readTree(ContractExamples.read("problem", name));
    node.put("instance", "/probe");
    return node;
  }

  @Test
  void anUnreadableBodyGivesTheMalformedBodyProblem() throws Exception {
    String body =
        mvc.perform(post("/probe").contentType(MediaType.APPLICATION_JSON).content("{oops"))
            .andExpect(status().isBadRequest())
            .andExpect(header().string("Content-Type", "application/problem+json"))
            .andReturn()
            .getResponse()
            .getContentAsString();

    assertThat(jsonMapper.readTree(body)).isEqualTo(example("bad-request-malformed-body"));
  }

  @Test
  void aMalformedRequestGivesTheSameProblem() throws Exception {
    String body =
        mvc.perform(get("/probe/malformed"))
            .andExpect(status().isBadRequest())
            .andReturn()
            .getResponse()
            .getContentAsString();

    assertThat(jsonMapper.readTree(body).path("detail"))
        .isEqualTo(example("bad-request-malformed-body").path("detail"));
  }

  @Test
  void tooManyCreationsGivesA429WithRetryAfter() throws Exception {
    String body =
        mvc.perform(get("/probe/limit"))
            .andExpect(status().isTooManyRequests())
            .andExpect(header().string("Retry-After", "42"))
            .andReturn()
            .getResponse()
            .getContentAsString();

    JsonNode actual = jsonMapper.readTree(body);
    assertThat(actual.path("detail")).isEqualTo(example("too-many-requests").path("detail"));
    assertThat(actual.path("type").asString()).isEqualTo("about:blank");
    assertThat(actual.path("status").asInt()).isEqualTo(429);
  }
}
