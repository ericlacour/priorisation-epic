package com.priorisationepic;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;

/**
 * Architecture hexagonale : le domaine ne dépend que du JDK, l'application que du domaine, les
 * adaptateurs ne dépendent pas les uns des autres, et la configuration peut tout voir.
 */
class ArchitectureTest {

  private static final JavaClasses PRODUCTION =
      new ClassFileImporter()
          .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
          .importPackages("com.priorisationepic");

  static ArchRule domainDependsOnTheJdkOnly(String root) {
    return classes()
        .that()
        .resideInAPackage(root + ".domain..")
        .should()
        .onlyDependOnClassesThat()
        .resideInAnyPackage("java..", root + ".domain..")
        .allowEmptyShould(true)
        .because("le domaine est en Java pur");
  }

  /** La façade de journalisation SLF4J est la seule bibliothèque tolérée dans les cas d'usage. */
  static ArchRule applicationDependsOnTheDomainOnly(String root) {
    return classes()
        .that()
        .resideInAPackage(root + ".application..")
        .should()
        .onlyDependOnClassesThat()
        .resideInAnyPackage("java..", "org.slf4j..", root + ".domain..", root + ".application..")
        .allowEmptyShould(true)
        .because("les cas d'usage ne voient que le domaine");
  }

  static ArchRule adaptersDoNotDependOnEachOther(String root) {
    return slices()
        .matching(root + ".adapter.(*).(*)..")
        .should()
        .notDependOnEachOther()
        .allowEmptyShould(true)
        .because("les adaptateurs ne se voient pas : ils passent par les ports");
  }

  @Test
  void domainDependsOnTheJdkOnly() {
    domainDependsOnTheJdkOnly("com.priorisationepic").check(PRODUCTION);
  }

  @Test
  void applicationDependsOnTheDomainOnly() {
    applicationDependsOnTheDomainOnly("com.priorisationepic").check(PRODUCTION);
  }

  @Test
  void adaptersDoNotDependOnEachOther() {
    adaptersDoNotDependOnEachOther("com.priorisationepic").check(PRODUCTION);
  }

  @Test
  void nothingOutsideConfigDependsOnConfig() {
    classes()
        .that()
        .resideOutsideOfPackage("..config..")
        .should()
        .onlyDependOnClassesThat()
        .resideOutsideOfPackage("com.priorisationepic.config..")
        .allowEmptyShould(true)
        .check(PRODUCTION);
  }

  @Test
  void aDomainClassImportingSpringBreaksTheBuild() {
    JavaClasses fixture =
        new ClassFileImporter().importPackages("com.priorisationepic.archfixture");
    assertThatThrownBy(
            () -> domainDependsOnTheJdkOnly("com.priorisationepic.archfixture").check(fixture))
        .isInstanceOf(AssertionError.class)
        .hasMessageContaining("PollutedDomainClass");
  }

  @Test
  void anApplicationClassImportingAnAdapterBreaksTheBuild() {
    JavaClasses fixture =
        new ClassFileImporter().importPackages("com.priorisationepic.archfixture");
    assertThatThrownBy(
            () ->
                applicationDependsOnTheDomainOnly("com.priorisationepic.archfixture")
                    .check(fixture))
        .isInstanceOf(AssertionError.class)
        .hasMessageContaining("PollutedApplicationClass");
  }

  @Test
  void anAdapterImportingAnotherAdapterBreaksTheBuild() {
    JavaClasses fixture =
        new ClassFileImporter().importPackages("com.priorisationepic.archfixture");
    assertThatThrownBy(
            () -> adaptersDoNotDependOnEachOther("com.priorisationepic.archfixture").check(fixture))
        .isInstanceOf(AssertionError.class);
  }
}
