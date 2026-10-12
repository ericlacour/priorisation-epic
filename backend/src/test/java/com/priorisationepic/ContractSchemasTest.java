package com.priorisationepic;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ContractSchemasTest {

  @Test
  void acceptsTheContractExampleAndRejectsAnInvalidState() throws Exception {
    assertThat(
            ContractSchemas.violations(
                "session-state.json", ContractExamples.read("session-state", "wsjf-facilitator")))
        .isEmpty();
    assertThat(ContractSchemas.violations("session-state.json", "{\"type\":\"sessionState\"}"))
        .isNotEmpty();
  }

  @Test
  void followsReferencesBetweenSchemas() throws Exception {
    String example = ContractExamples.read("session-state", "wsjf-facilitator");
    String broken = example.replace("\"complete\"", "\"completeX\"");
    assertThat(ContractSchemas.violations("session-state.json", broken)).isNotEmpty();
  }
}
