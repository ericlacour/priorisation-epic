# Implementation Plan: Session de priorisation WSJF

**Branch**: `claude/compassionate-clarke-fqqtbd` (feature `001-wsjf-prioritization-session`) | **Date**: 2026-10-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-wsjf-prioritization-session/spec.md`

## Summary

Il s'agit d'une application web collaborative pour animer des sessions de priorisation
WSJF. L'animateur prépare la session (saisie manuelle ou import Excel, échelle continue ou
Fibonacci), puis invite des participants identifiés par un pseudo. On peut fixer les
valeurs directement, ou passer par des tours de vote masqués, suivis d'une révélation et
d'un consensus. Le tableau calcule CoD = BV + TC + RR/OE et WSJF = CoD / JS, le trie et le
met à jour en temps réel chez tous. Il s'exporte en CSV, Confluence et JSON.

**Approche technique** :
- Une **image unique** déployée en **pod Kubernetes** : un back **Java 25 / Spring Boot 4**
  qui sert aussi le front **Angular 21**, avec **PostgreSQL 17** pour le stockage.
- Le calcul du score est isolé dans un module de domaine en Java pur, sans Spring.
- Le temps réel passe par **SSE**, avec des notifications **sans données métier**. Le
  client relit ensuite sa vue, filtrée par le serveur selon son rôle, ce qui garantit
  le masquage des votes.
- Les droits d'animateur passent par un **jeton d'animation** placé dans le fragment de
  l'URL. Les modifications simultanées sont détectées par **verrouillage optimiste**.
- **Dependabot, CodeQL et Gitleaks** sont mis en place dès le premier incrément.

Le détail des choix est dans [research.md](./research.md).

## Technical Context

**Language/Version**: Java 25 (LTS) pour le back, TypeScript (version fournie par Angular 21) pour le front

**Primary Dependencies**:
- Back : Spring Boot 4.0.x (Web MVC, Data JPA, Validation, Actuator), Flyway, Apache POI
  (XSSF), Apache Commons CSV, Jackson, Micrometer avec le format Prometheus
- Front : Angular 21 (composants standalone, signals, zoneless), Angular CDK, locale
  `fr-FR`

**Storage**: PostgreSQL 17 (managé par l'infrastructure), avec un schéma versionné par migrations Flyway

**Testing**:
- Back : JUnit 5, AssertJ, jqwik (tests de propriétés), Spring Boot Test et MockMvc,
  Testcontainers (PostgreSQL), ArchUnit, JaCoCo
- Front : Vitest et Angular Testing Library
- Bout en bout : Playwright, avec plusieurs contextes de navigateur

**Target Platform**: conteneur Linux (OCI) sur Kubernetes (compatible OpenShift : non-root, système de fichiers en lecture seule), navigateurs récents (Chrome, Edge, Firefox, Safari)

**Project Type**: application web (back et front dans le même dépôt, une seule image livrée)

**Performance Goals**: propagation d'une modification à tous les membres connectés en moins de 2 s (SC-002) ; 10 participants et 50 fonctionnalités par session sans ralentissement (SC-005)

**Constraints**:
- Aucune authentification : pseudo, plus jeton d'animation pour l'animateur
  (constitution III, version 2.0.0).
- Masquage des votes garanti côté serveur (SC-004).
- Réseau interne uniquement.
- Interface en français (constitution V).
- Import limité à 5 Mo et 1 000 lignes.

**Scale/Scope**: environ 20 sessions actives en même temps, 10 participants et 50 à 100 fonctionnalités par session, une dizaine d'écrans

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Ce contrôle est fait par rapport à la constitution v2.0.0.

| Principe / règle | Exigence | Comment le plan y répond | Statut |
|------------------|----------|--------------------------|--------|
| **I. Score transparent** | Critères, poids et formule visibles ; contribution de chaque critère ; aucun facteur caché | Formule et règle d'égalité renvoyées par l'API (`formula`, `tieBreakRule`) et affichées. `score.explanation` montre le calcul avec les vraies valeurs (FR-016). Le calcul n'existe qu'à un seul endroit, le domaine. Les exports rappellent la formule | ✅ |
| **II. Logique testée** | Tests du calcul, du tri, des égalités, de la validation et des cas limites ; domaine isolé ; CI bloquante | Module `domain` en Java pur, isolement vérifié par ArchUnit. Tests unitaires et de propriétés jqwik. Seuil JaCoCo de 90 %. CI obligatoire pour merger | ✅ |
| **III. Travail en équipe** | Données partagées côté serveur ; auteur et date de chaque modification ; pas d'écrasement silencieux ; v1 par pseudo | PostgreSQL. Table `change_log` écrite dans la même transaction. `@Version` et réponse 409 avec l'état actuel. Pseudo et jetons sans mot de passe ni compte | ✅ |
| **IV. Web centré sur l'usage** | Parcours priorisés ; navigateurs récents, clavier, écran de portable ; erreurs actionnables | Parcours P1 à P5 livrables séparément. Angular CDK (focus, a11y). Mise en page adaptée dès 1280 px. Problem Details avec un `detail` en français qui dit quoi corriger | ✅ |
| **V. Produit en français** | Interface et documentation en français ; formats FR ; convention de code fixée ; textes centralisés | Locale `fr-FR`. **Convention : identifiants de code en anglais**, avec les sigles métier `bv/tc/rrOe/js/cod/wsjf` (R11). Catalogue `messages.fr.ts` et `messages.properties`. Spec, plan et tâches en français | ✅ |
| **VI. Données portables** | Export CSV et JSON ; JSON recalculable ; import validé avec rejets détaillés ; aller-retour testé ; formats versionnés | CSV, JSON (`formatVersion: 1`, méthode et échelle incluses), import CSV, JSON et Excel avec aperçu. Test d'aller-retour obligatoire (SC-008). Formats décrits dans `contracts/file-formats.md` | ✅ |
| **Architecture** | Domaine indépendant de l'interface, de l'API et de la persistance | `backend/src/main/java/…/domain` sans dépendance vers les autres couches (règle ArchUnit) | ✅ |
| **Données** | Stockage partagé, migrations versionnées, ni données réelles ni secrets dans le dépôt | Flyway. Secrets dans un Secret Kubernetes et des variables d'environnement. Jetons stockés sous forme d'empreinte | ✅ |
| **Sécurité** | Secrets en variables d'environnement ; validation des entrées côté serveur | Bean Validation, puis domaine, puis contraintes en base. Taille d'upload limitée. Jetons jamais journalisés | ✅ |
| **Outillage de sécurité** | **Dependabot, CodeQL et Gitleaks** actifs ; alertes hautes et critiques traitées | `.github/dependabot.yml` (maven, npm, docker, github-actions). `codeql.yml` (java-kotlin, javascript-typescript, actions). `gitleaks.yml` sur les PR et `main` (R13). Inclus dans la **phase de fondation** des tâches | ✅ |
| **Workflow** | Flux Spec Kit ; branche et PR ; quality gates (tests, relecture, CodeQL et Gitleaks au vert) | Contrôles obligatoires documentés dans le quickstart. La relecture par une autre personne reste un réglage GitHub | ✅ |

**Résultat avant la phase 0** : PASS, aucune violation.
**Résultat après la phase 1** : PASS. Le modèle de données et les contrats ne contredisent
aucun principe. Deux points sont à surveiller pendant l'implémentation :
1. Les exports et le flux SSE ne doivent jamais contourner le filtrage par rôle (SC-004).
   Des tests de contrat le vérifieront dans les deux cas.
2. L'Ingress doit rester interne. Le manifeste fournit une annotation et une NetworkPolicy,
   mais l'exposition réelle dépend de l'infrastructure de l'entreprise.

## Project Structure

### Documentation (this feature)

```text
specs/001-wsjf-prioritization-session/
├── spec.md
├── plan.md              # Ce fichier
├── research.md          # Phase 0 : décisions techniques (R1 à R14)
├── data-model.md        # Phase 1 : entités, règles, transitions
├── quickstart.md        # Phase 1 : guide de validation
├── contracts/
│   ├── openapi.yaml     # API REST
│   ├── sse-events.md    # Flux temps réel
│   └── file-formats.md  # Import et export Excel, CSV, Confluence, JSON
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks), pas créé par ce plan
```

### Source Code (repository root)

```text
backend/                                   # Maven, Java 25, Spring Boot 4
├── pom.xml
├── mvnw
└── src/
    ├── main/
    │   ├── java/fr/priorisation/epic/
    │   │   ├── domain/                    # Java pur, sans Spring ni JPA (ArchUnit)
    │   │   │   ├── method/                # PrioritizationMethod, WsjfMethod, Score, Ranking
    │   │   │   ├── scale/                 # Scale, ScaleType
    │   │   │   └── round/                 # règles de tour et de visibilité des votes
    │   │   ├── application/               # services transactionnels, contrôle des rôles, change_log
    │   │   ├── persistence/               # entités JPA, repositories
    │   │   ├── api/                       # contrôleurs REST, DTO, Problem Details, SSE
    │   │   ├── io/                        # import et export : xlsx, csv, confluence, json
    │   │   ├── realtime/                  # émetteurs SSE, LISTEN/NOTIFY PostgreSQL
    │   │   └── config/
    │   └── resources/
    │       ├── application.yml
    │       ├── messages.properties        # messages d'erreur en français (centralisés)
    │       └── db/migration/              # Flyway V1__init.sql…
    └── test/java/fr/priorisation/epic/
        ├── domain/                        # unitaires et propriétés jqwik
        ├── architecture/                  # règles ArchUnit
        ├── api/                           # tests de contrat REST (Testcontainers)
        └── io/                            # formats et aller-retour

frontend/                                  # Angular 21
├── package.json
├── angular.json
├── playwright.config.ts
├── e2e/                                   # scénarios V1 à V14 du quickstart
└── src/app/
    ├── i18n/messages.fr.ts                # catalogue unique des textes de l'interface
    ├── core/                              # client API, flux SSE, stockage des jetons
    ├── sessions/                          # liste, création, rejoindre
    ├── board/                             # tableau WSJF, détail du calcul, édition
    ├── rounds/                            # vote masqué, révélation, historique des tours
    ├── import-export/
    └── history/

deploy/k8s/                                # Kustomize
├── base/                                  # Deployment, Service, Ingress interne, ConfigMap, NetworkPolicy
└── overlays/local/

Dockerfile                                 # multi-étapes : build front, puis build back, puis JRE 25 non-root
.github/
├── dependabot.yml                         # maven, npm, docker, github-actions
└── workflows/
    ├── ci.yml                             # back, front, e2e, image
    ├── codeql.yml                         # java-kotlin, javascript-typescript, actions
    └── gitleaks.yml                       # détection de secrets (PR et main)
.gitleaks.toml
```

**Structure Decision** : une application web, avec deux projets sources (`backend/` et
`frontend/`) et **un seul artefact livré**. Le `Dockerfile` construit le front, copie le
bundle dans `backend/src/main/resources/static`, puis produit une image Spring Boot. Le
déploiement en pod est décrit dans `deploy/k8s/`. L'outillage de sécurité imposé par la
constitution se trouve dans `.github/`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

Aucune violation. Pour mémoire, la constitution exige de justifier tout nouveau framework.
Celui-ci étant le premier plan, il fixe la stack de référence. Chaque choix est justifié
dans [research.md](./research.md) (R1 à R14), et toute dépendance ajoutée plus tard devra
être justifiée dans le plan de la feature concernée.
