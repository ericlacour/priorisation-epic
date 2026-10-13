package com.priorisationepic;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ContractSchemasTest {

  @Test
  void acceptsAContractExampleAndRefusesAnUnknownField() throws Exception {
    String state = ContractExamples.read("session-state", "participant-view");

    assertThat(ContractSchemas.validate("session-state", state)).isEmpty();
    assertThat(
            ContractSchemas.validate("session-state", state.replaceFirst("\\{", "{\"extra\":1,")))
        .isNotEmpty();
  }

  @Test
  void refusesAMalformedCriterionKey() {
    assertThat(ContractSchemas.validate("criteria", "{\"BV\":3}")).isNotEmpty();
    assertThat(ContractSchemas.validate("criteria", "{\"bv\":3,\"tc\":null}")).isEmpty();
    assertThat(ContractSchemas.validate("criteria", "{\"bv\":0}")).isNotEmpty();
  }

  @Test
  void checksUuidFormats() {
    assertThat(
            ContractSchemas.validate(
                "delete-feature",
                "{\"type\":\"deleteFeature\",\"featureId\":\"nope\",\"version\":1}"))
        .isNotEmpty();
  }
}
