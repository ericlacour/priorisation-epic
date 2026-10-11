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

**Approche technique** : alignement complet sur `ericlacour/planning-poker` (PP).
- **Socle** : back Java 25 / Spring Boot 4.1 en **architecture hexagonale**, front
  Angular 22. On ajoute PostgreSQL 17 pour garder les sessions.
- **Temps réel** : **WebSocket brut**, seul canal des actions de session. Après chaque
  changement, le serveur envoie un `sessionState` complet, **filtré pour chaque
  destinataire**, ce qui garantit le masquage des votes.
- **Contrat** : un dossier `contract/` (OpenAPI 3.2, AsyncAPI 3.1, JSON Schema et
  exemples) validé en CI.
- **Hébergement V1, temporaire** : l'application est sur **Render**, comme PP (API en
  Docker compatible OpenShift et site statique), déployée en posant une étiquette `v*`.
  La base est sur **Neon** (offre gratuite, sans expiration).
- **Sécurité du dépôt** : Dependabot aux conventions de PP. **CodeQL et Gitleaks** sont
  ajoutés, comme l'exige la constitution.

Le détail des choix est dans [research.md](./research.md).

## Technical Context

**Language/Version**: Java 25 (LTS, Temurin) ; TypeScript 6.0 ; Node.js ≥ 24.15

**Primary Dependencies**:
- Back : Spring Boot 4.1.x (webmvc, websocket, Data JPA, validation), Flyway, Apache POI
  (XSSF), Apache Commons CSV, Jackson.
- Front : Angular 22.x (standalone, signals), API `WebSocket` native du navigateur.
- Contrat : Redocly CLI, `@asyncapi/parser`, Ajv.

**Storage**: PostgreSQL 17, avec un schéma versionné par migrations Flyway. La connexion passe par `DATABASE_URL`. En V1, la base est sur **Neon**, offre gratuite, région AWS Frankfurt, connexion directe en SSL. Voir research, R11

**Testing**:
- Back : JUnit 5, AssertJ, jqwik, `spring-boot-starter-webmvc-test`, tests WebSocket,
  Testcontainers (PostgreSQL), ArchUnit, JaCoCo.
- Front : Vitest avec jsdom, et des scripts `node --test`.
- Bout en bout : Playwright sur Chromium, Firefox et WebKit (`e2e/` et `e2e-journeys/`), avec
  `@axe-core/playwright` pour l'accessibilité.
- Contrat : `npm run validate` et `npm test`.

**Target Platform**: V1 sur Render (Web Service Docker et Static Site, région Frankfurt) et base sur Neon (AWS Frankfurt). L'image est compatible OpenShift en vue de la cible pérenne commune avec PP. Navigateurs récents, testés sur Chromium, Firefox et WebKit

**Project Type**: application web (`contract/`, `backend/`, `frontend/`, `deploy/`), avec la même organisation que PP

**Performance Goals**: propagation d'une modification à tous les membres connectés en moins de 2 s (SC-002) ; avec 10 participants et 50 fonctionnalités, propagation en moins de 2 s et ouverture de session en moins de 3 s (SC-005)

**Constraints**:
- Aucune authentification : pseudo, plus jeton d'animation (constitution III, v2.0.0).
- Masquage côté serveur, connexion par connexion (SC-004).
- Une seule instance en V1 (Render Free).
- Mise en veille de Render Free : `heartbeat` WebSocket et écran de réveil.
- **Exposition publique sur Render acceptée pour la V1 temporaire**, avec les garde-fous
  de PP (limitation de débit, tailles maximales, CORS).
- Interface en français.
- Import limité à 5 Mo et 1 000 lignes.
- **Téléphone en lecture seule** en V1 (moins de 600 px) : saisir, voter et animer demandent
  un ordinateur.
- **Contrat d'interface** : les maquettes `mockups/index.html` et la charte de
  `mockups/README.md` (rouge principal, anthracite au lieu du noir, thèmes clair et sombre,
  contrastes AA) font référence pour le front.
- Hors périmètre de la v1 (voir spec, « Hors périmètre de la version 1 ») : authentification,
  équipes, Jira, connexion à Confluence, IA / LLM, notifications, pondérations WSJF,
  autres méthodes, fonctionnalités avancées de SAFe. Aucune tâche ne doit les couvrir.

**Scale/Scope**: environ 20 sessions actives en même temps, 10 participants et 50 fonctionnalités par session (cible testée, SC-005), jusqu'à 100 sans garantie de performance, une dizaine d'écrans

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Ce contrôle est fait par rapport à la constitution v2.2.0.

| Principe / règle | Exigence | Comment le plan y répond | Statut |
|------------------|----------|--------------------------|--------|
| **I. Score transparent** | Formule visible ; contribution de chaque critère ; aucun facteur caché | `sessionState` porte `formula`, `tieBreakRule` et, pour chaque fonctionnalité, `score.explanation` avec les vraies valeurs. Le calcul n'existe qu'à un seul endroit, `domain`. Les exports rappellent la formule | ✅ |
| **II. Logique testée** | Calcul, tri, égalités, validation et cas limites testés ; domaine isolé ; CI bloquante | Architecture hexagonale, isolement vérifié par ArchUnit. Tests unitaires et jqwik. JaCoCo à 90 % sur `domain`. Exemples du contrat validés. CI obligatoire pour merger | ✅ |
| **III. Travail en équipe** | Données partagées ; auteur et date ; pas d'écrasement silencieux ; pseudo en v1 | PostgreSQL. Table `change_log` dans la même transaction. Verrou par session, `@Version` et `error STALE_VERSION`. Pseudo et jetons, sans mot de passe ni compte | ✅ |
| **IV. Web centré sur l'usage** | Parcours priorisés ; clavier et écran de portable ; erreurs actionnables | Parcours P1 à P5 livrables séparément. Maquettes des 9 écrans validées avant l'implémentation (contrat d'interface), avec des contrastes AA vérifiés. Contrôles d'accessibilité axe-core, comme dans PP. Codes d'erreur traduits en messages français qui disent quoi corriger | ✅ |
| **V. Produit en français** | Interface et documents en français ; formats FR ; convention fixée ; textes centralisés | Locale `fr-FR`. **Convention : code et contrat en anglais** (comme PP, autorisé par le principe V depuis la v2.1.0), sigles métier conservés. Catalogue `messages.fr.ts`. Spec, plan et tâches en français | ✅ |
| **VI. Données portables** | Export CSV et JSON ; JSON recalculable ; import validé ; aller-retour testé ; formats versionnés | CSV, JSON (`formatVersion: 1`), import xlsx, csv et json avec aperçu. Test d'aller-retour SC-008. Formats dans `contracts/file-formats.md` | ✅ |
| **Architecture** | Domaine indépendant | `domain` sans dépendance, `application` limitée aux ports (ArchUnit) | ✅ |
| **Données** | Migrations versionnées ; ni données réelles ni secrets dans le dépôt | Flyway. `DATABASE_URL`, `ALLOWED_ORIGINS` et les secrets Render sont dans Render et GitHub Secrets. Jetons stockés sous forme d'empreinte | ✅ |
| **Sécurité** | Secrets en variables d'environnement ; validation côté serveur | Validation par JSON Schema côté contrat, Bean Validation, domaine et contraintes en base. Limites de taille et de débit reprises de PP | ✅ |
| **Outillage de sécurité** | **Dependabot, CodeQL et Gitleaks** actifs ; alertes hautes et critiques traitées | `dependabot.yml` aux conventions de PP. `codeql.yml` (java-kotlin, javascript-typescript, actions). `gitleaks.yml`. Tous dans la **phase de fondation** des tâches (R15) | ✅ |
| **Workflow** | Flux Spec Kit ; PR ; CI, CodeQL et Gitleaks au vert ; relecture | Contrôles obligatoires sur `main`, documentés dans le quickstart | ✅ |

**Résultat avant la phase 0** : PASS.
**Résultat après la phase 1** : PASS, avec trois points de vigilance :
1. **Le masquage** doit être appliqué partout : `sessionState`, `GET /api/sessions/{id}`
   et les exports. Les exemples du contrat et des tests aller-retour le vérifient.
2. **Exposition publique sur Render** : la spec suppose un usage interne. Ce n'est pas une
   violation de la constitution, mais c'est un **risque accepté** pour la V1 temporaire :
   **consigne : ne pas saisir de données confidentielles tant que l'application est sur
   Neon.**
3. **Limites de Neon en gratuit** : restauration sur 6 heures seulement et mise en veille
   après 5 minutes. On exporte en JSON après chaque atelier important, et les connexions
   sont validées avant usage pour supporter le réveil de la base (research, R11).

## Project Structure

### Documentation (this feature)

```text
specs/001-wsjf-prioritization-session/
├── spec.md
├── plan.md              # Ce fichier
├── research.md          # Phase 0 : décisions R1 à R16 (alignement PP)
├── data-model.md        # Phase 1 : entités, règles, transitions
├── quickstart.md        # Phase 1 : guide de validation
├── contracts/           # Phase 1 : conception, à transcrire dans contract/
│   ├── openapi.yaml     # REST : entrée, fichiers, historique, santé
│   ├── asyncapi.yaml    # WebSocket : intentions et sessionState filtré
│   └── file-formats.md  # Excel, CSV, Confluence, JSON
├── mockups/             # Contrat d'interface : 9 écrans cliquables (index.html) et charte (README.md)
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
contract/                                  # source de vérité des échanges (comme PP)
├── openapi.yaml                           # OpenAPI 3.2.0
├── asyncapi.yaml                          # AsyncAPI 3.1.0
├── schemas/                               # JSON Schema 2020-12, un $id par fichier
├── examples/<schéma>/<cas>.json
├── scripts/validate.mjs (+ .test.mjs)     # Redocly, @asyncapi/parser, Ajv, règles de masquage
├── redocly.yaml
└── package.json

backend/                                   # Maven, Java 25, Spring Boot 4.1
├── Dockerfile                             # Temurin 25 : JDK pour le build, JRE à l'exécution, UID arbitraire, groupe 0
├── pom.xml
└── src/
    ├── main/java/com/priorisationepic/
    │   ├── domain/                        # Java pur : WsjfMethod, Scale, Ranking, règles des tours et de visibilité
    │   ├── application/                   # cas d'usage et ports (SessionRepository, Broadcaster, Clock), SessionLocks
    │   ├── adapter/in/rest/               # entrée, import et export, historique, santé, limites (comme PP)
    │   ├── adapter/in/ws/                 # SessionSocketHandler, WebSocketBroadcaster, ClientMessages, ServerMessages
    │   ├── adapter/in/scheduling/         # purge des aperçus d'import expirés
    │   ├── adapter/out/persistence/       # JPA et Flyway (remplace adapter/out/memory de PP)
    │   ├── adapter/out/io/                # xlsx, csv, confluence, json
    │   └── config/                        # WebSocketConfig, AllowedOrigins, JacksonConfig, WebConfig
    ├── main/resources/db/migration/       # V1__init.sql…
    └── test/java/com/priorisationepic/    # domain, application, adapter/in/{rest,ws}, ArchitectureTest, tests aller-retour du contrat

frontend/                                  # Angular 22
├── package.json
├── scripts/                               # write-config.mjs, inject-csp.mjs, serve-dist.mjs (+ tests node)
├── e2e/                                   # Playwright contre un faux socket (+ accessibilité axe-core)
├── e2e-journeys/                          # parcours V1 à V15 contre le vrai webservice
└── src/app/
    ├── i18n/messages.fr.ts                # catalogue unique des textes de l'interface
    ├── api/ config/ storage/ wake/ theme/ top-bar/   # même découpage que PP
    ├── home/                              # liste des sessions, création
    ├── session/                           # service WebSocket, rejoindre, état de session
    ├── board/                             # tableau WSJF, détail du calcul, édition
    ├── rounds/                            # vote masqué, révélation, consensus
    ├── import-export/
    └── history/

deploy/                                    # Render V1, comme PP
├── render.yaml                            # API Docker et site statique (DATABASE_URL Neon en secret)
├── render-deploy.sh (+ .test.sh)
└── README.md

.github/
├── dependabot.yml                         # npm (frontend, contract), maven, docker, github-actions : mensuel, délai de 7 j
└── workflows/
    ├── ci.yml                             # contract, backend (+ image), deploy-script, frontend, journeys
    ├── deploy.yml                         # sur étiquette v* : API puis front
    ├── codeql.yml                         # ajout par rapport à PP
    └── gitleaks.yml                       # ajout par rapport à PP
.gitleaks.toml
```

**Structure Decision** : la même organisation que planning-poker : un contrat partagé,
un back hexagonal, un front Angular, un déploiement Render par blueprint. Les seules
différences sont imposées par la spec ou la constitution :
- l'adaptateur `persistence` (PostgreSQL) remplace l'adaptateur `memory` ;
- la base est sur Neon, hors du blueprint, et reliée par la variable secrète `DATABASE_URL` ;
- CodeQL et Gitleaks s'ajoutent à la CI.

## Ordre de mise en place

- **Dès la fondation**, avant toute fonctionnalité :
  - `contract/` et sa validation ;
  - la CI (`ci.yml`) ;
  - **Dependabot, CodeQL et Gitleaks** ;
  - le `Dockerfile` du back, construit et démarré en CI pour vérifier tôt qu'il reste
    compatible OpenShift.
- **Déploiement reporté** : on le met en place quand une première fonctionnalité est
  testable de bout en bout, au plus tôt après le MVP (US1). Il comprend :
  - `deploy/render.yaml`, `deploy/render-deploy.sh` et son test ;
  - `deploy.yml` et `deploy/README.md` ;
  - la création des services Render et du projet Neon ;
  - les secrets GitHub du déploiement.

  Il fait l'objet d'une phase dédiée dans `tasks.md`, et non de la fondation.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

Aucune violation. Les dépendances absentes de planning-poker (Spring Data JPA, Flyway,
PostgreSQL, Apache POI, Commons CSV, jqwik, Testcontainers) sont imposées par la spec
(persistance, import et export) ou par le principe II. Elles sont justifiées dans
[research.md](./research.md), sections R9, R10 et R14.
