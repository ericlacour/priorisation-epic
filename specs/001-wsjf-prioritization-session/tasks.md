---

description: "Liste des tâches de la feature 001 : session de priorisation WSJF"
---

# Tasks: Session de priorisation WSJF

**Input** : documents de conception dans `/specs/001-wsjf-prioritization-session/`

**Prérequis** : [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests** : **obligatoires**. Le principe II de la constitution impose des tests
automatisés sur toute la logique métier, et la CI bloque le merge. Dans chaque parcours,
on écrit les tests **d'abord** et on vérifie qu'ils **échouent** avant d'implémenter.

**Organisation** : les tâches sont regroupées par parcours utilisateur (US1 à US5), pour
pouvoir implémenter, tester et livrer chaque parcours indépendamment.

**Projet de référence** : `ericlacour/planning-poker` (PP), dépôt public, branche `main`.
Quand une tâche dit « sur le modèle de PP : `<chemin>` », il faut lire ce fichier dans PP
et en reprendre l'organisation, les conventions et les tests, en l'adaptant aux noms et
au domaine de ce projet.

**Contrat d'interface** : les maquettes [mockups/index.html](./mockups/index.html) (11 écrans, ordinateur et téléphone, thèmes clair et sombre, avec la charte décrite dans [mockups/README.md](./mockups/README.md)) font référence pour toutes les tâches front. Les jetons de couleur de `mockups/README.md` sont repris dans `frontend/src/styles/tokens.css`.

**Hors périmètre** : aucune tâche ne doit traiter un sujet de la section « Hors périmètre
de la version 1 » de la spec. Cela exclut l'authentification, les équipes, Jira, la
connexion à Confluence, l'IA / LLM, les notifications, les pondérations WSJF, les autres
méthodes de scoring et les fonctionnalités avancées de SAFe.

## Format : `[ID] [P?] [Story] Description`

- **[P]** : la tâche peut être faite en parallèle (fichiers différents, aucune dépendance
  vers une tâche non terminée).
- **[Story]** : le parcours utilisateur concerné (US1 à US5).
- Chaque description indique le chemin exact du fichier.

## Conventions de chemins

- Contrat : `contract/` (`openapi.yaml`, `asyncapi.yaml`, `schemas/`, `examples/`, `scripts/`).
- Back : `backend/src/main/java/com/priorisationepic/…` et `backend/src/test/java/com/priorisationepic/…`.
- Migrations : `backend/src/main/resources/db/migration/`.
- Front : `frontend/src/app/…` ; e2e : `frontend/e2e/` et `frontend/e2e-journeys/`.
- Déploiement : `deploy/` ; CI et sécurité : `.github/`.
- Identifiants de code et contrat en anglais. Textes d'interface en français, dans
  `frontend/src/app/i18n/messages.fr.ts` (constitution V, research R13).

---

## Phase 1 : Setup (infrastructure commune)

**Objectif** : créer le squelette des trois projets, sur le modèle de PP.

- [ ] T001 Créer l'arborescence racine `contract/`, `backend/`, `frontend/` et `deploy/`, plus un `README.md` racine décrivant chaque dossier, sur le modèle de PP : `README.md`. Ajouter un `.gitignore` racine (target/, node_modules/, dist/, test-results/, .env)
- [ ] T002 Initialiser le projet Maven `backend/pom.xml` : parent `spring-boot-starter-parent` 4.1.x, `java.version` 25, `finalName` `priorisation-epic`. Starters `webmvc`, `websocket`, `data-jpa`, `validation` ; `org.flywaydb:flyway-core` et `flyway-database-postgresql` ; driver `org.postgresql:postgresql` ; `org.apache.poi:poi-ooxml` ; `org.apache.commons:commons-csv`. En test : `spring-boot-starter-webmvc-test`, `archunit-junit5`, `net.jqwik:jqwik`, `org.testcontainers:postgresql` et `junit-jupiter`. Plugin `jacoco-maven-plugin` avec une règle à 90 % de lignes sur `com.priorisationepic.domain.*`. Ajouter le Maven wrapper (`backend/mvnw`, `backend/mvnw.cmd`, `backend/.mvn/`). Sur le modèle de PP : `backend/pom.xml`
- [ ] T003 Créer la classe d'application `backend/src/main/java/com/priorisationepic/PriorisationEpicApplication.java` et les paquets vides, chacun avec un `package-info.java` qui décrit son rôle : `domain`, `application`, `adapter/in/rest`, `adapter/in/ws`, `adapter/in/scheduling`, `adapter/out/persistence`, `adapter/out/io`, `config`
- [ ] T004 [P] Initialiser le front Angular 22 dans `frontend/` (`package.json` avec `packageManager` npm@11 et `engines.node` ≥ 24.15 ; Angular 22.x ; TypeScript ~6.0 ; Vitest et jsdom ; `@playwright/test` ; `@axe-core/playwright` ; prettier). Reprendre les scripts de PP : `start`, `build`, `build:e2e`, `test`, `e2e`, `e2e:journeys`. Dans `frontend/playwright.config.ts` et `frontend/playwright.journeys.config.ts`, déclarer trois projets : `chromium`, `firefox` et `webkit` (Firefox en plus de PP, constitution IV). Sur le modèle de PP : `frontend/package.json`, `frontend/angular.json`, `frontend/.prettierrc`, `frontend/.editorconfig`
- [ ] T005 [P] Configurer la locale `fr-FR` (`registerLocaleData` et `LOCALE_ID`) dans `frontend/src/app/app.config.ts`. Créer `frontend/src/styles/tokens.css` avec les jetons de couleur (thèmes clair et sombre) de `specs/001-wsjf-prioritization-session/mockups/README.md`, sur le modèle de PP : `frontend/src/styles/tokens.css`. Créer `frontend/src/app/layout/screen-size.service.ts`, qui expose `isPhone` (largeur < 600 px) et sert à passer en **lecture seule sur téléphone** (spec, « Hors périmètre », saisie sur téléphone) : actions de saisie, de vote et d'animation masquées, et bandeau « Pour voter ou modifier, utilisez un ordinateur ». Créer le catalogue de textes `frontend/src/app/i18n/messages.fr.ts`, avec dès le départ les noms et les définitions des critères WSJF de FR-016a (BV, TC, RR/OE, JS, CoD, WSJF), qui exporte un objet `MESSAGES` typé
- [ ] T006 [P] Initialiser `contract/package.json` (Node ≥ 24.15 ; `@redocly/cli`, `@asyncapi/parser`, `ajv`, `ajv-formats`, `yaml` ; scripts `validate` et `test`) et `contract/redocly.yaml`. Sur le modèle de PP : `contract/package.json`, `contract/redocly.yaml`

---

## Phase 2 : Fondations (bloquantes pour tous les parcours)

**Objectif** : contrat, CI, outillage de sécurité, image, base de données, plomberie WebSocket et noyau du domaine.

**⚠️ CRITIQUE** : aucun parcours ne peut commencer avant la fin de cette phase.

### Contrat

- [ ] T007 Écrire le validateur `contract/scripts/validate.mjs` et ses tests `contract/scripts/validate.test.mjs`, sur le modèle de PP : `contract/scripts/`. Ce qu'il vérifie :
  - `openapi.yaml` est valide selon OpenAPI 3.2 (Redocly) ;
  - `asyncapi.yaml` est valide selon AsyncAPI 3.1 ;
  - tous les `$ref` sont résolus ;
  - chaque schéma référencé a au moins un exemple dans `examples/<schéma>/` ;
  - chaque exemple est valide contre son schéma.

  Prévoir un point d'extension pour les règles métier sur `sessionState` (ajoutées en T070)
- [ ] T008 Créer `contract/openapi.yaml` et `contract/asyncapi.yaml` à partir de `specs/001-wsjf-prioritization-session/contracts/openapi.yaml` et `asyncapi.yaml`. Déplacer chaque charge utile dans `contract/schemas/<nom-kebab>.json` (JSON Schema 2020-12, `$id` égal au nom du fichier), référencée par `$ref`. Dans cette tâche, créer seulement les schémas communs : `problem.json`, `hello.json`, `heartbeat.json`, `tick.json`, `error.json`, `health-response.json`, `criteria.json`, `scale.json`
- [ ] T009 [P] Ajouter les exemples des schémas de T008 dans `contract/examples/<schéma>/<cas>.json`, dont `examples/error/stale-version.json` et `examples/hello/with-animation-token.json`. Rédiger `contract/README.md` sur le modèle de PP : `contract/README.md`

### CI et outillage de sécurité (constitution)

- [ ] T010 Créer `.github/workflows/ci.yml`, sur le modèle de PP : `.github/workflows/ci.yml`.
  - Déclencheurs : `push` sur `main` et `pull_request`.
  - `permissions: contents: read` et `concurrency`.
  - Jobs :
    - `contract` (Node 24 : `npm ci`, `npm run validate`, `npm test`) ;
    - `backend` (Temurin 25 : `./mvnw -B verify`, puis build de l'image Docker) ;
    - `frontend` (Node 24 : `npm ci`, `npm test`, build de production avec `API_BASE_URL=https://api.example.invalid`, build e2e, `npx playwright install --with-deps chromium firefox webkit`, `npm run e2e`) ;
    - `journeys`, qui reste vide jusqu'à T048.
- [ ] T011 [P] Créer `.github/dependabot.yml` avec les conventions de PP : `.github/dependabot.yml`.
  - Écosystèmes : `npm` (`/frontend`, `/contract`), `maven` (`/backend`), `docker` (`/backend`) et `github-actions` (`/`).
  - Fréquence `interval: monthly`, `cooldown.default-days: 7`, préfixes `chore(deps)` et `chore(ci)`.
  - Groupes : `angular` (`@angular/*` et `typescript`), mineures et patchs par écosystème, `temurin`.
  - Exclusions : versions majeures et mineures de `typescript`, version majeure de `eclipse-temurin`.
- [ ] T012 [P] Créer `.github/workflows/codeql.yml`.
  - Langages `java-kotlin` (build manuel avec `./mvnw -B -DskipTests package` dans `backend/`), `javascript-typescript` et `actions`.
  - Déclencheurs : `pull_request`, `push` sur `main` et `schedule` hebdomadaire.
  - Permissions `security-events: write`, `contents: read`, `actions: read`.
- [ ] T013 [P] Créer `.github/workflows/gitleaks.yml` (`gitleaks/gitleaks-action` sur `pull_request` et `push` sur `main`, avec `fetch-depth: 0`) et `.gitleaks.toml` (`[extend] useDefault = true`, liste blanche limitée aux exemples factices de `contract/examples/`)
- [ ] T014 [P] Documenter dans `README.md`, section « Sécurité du dépôt », les réglages GitHub à activer à la main :
  - alertes et mises à jour de sécurité Dependabot ;
  - protection de `main`, avec CI, CodeQL et Gitleaks obligatoires et une relecture ;
  - règle de publication : avant de poser une étiquette `v*`, vérifier dans *Security → Dependabot alerts* et *Code scanning* qu'aucune alerte haute ou critique n'est ouverte, sinon documenter la dérogation dans la PR ou l'issue correspondante (constitution, outillage de sécurité).

### Image et configuration

- [ ] T015 Créer `backend/Dockerfile` sur le modèle de PP : `backend/Dockerfile` :
  - build en `eclipse-temurin:25-jdk-noble`, exécution en `eclipse-temurin:25-jre-noble` ;
  - utilisateur UID 10001 dans le groupe 0, `chgrp -R 0 /app && chmod -R g=u /app` ;
  - `ENTRYPOINT java -Djava.io.tmpdir=/tmp -XX:MaxRAMPercentage=75 -jar /app/app.jar`.

  Ajouter au job `backend` de `.github/workflows/ci.yml` l'étape de PP « L'image démarre sous un UID arbitraire, en lecture seule hors /tmp, avec des journaux JSON », avec un service PostgreSQL 17 dans le job et `DATABASE_URL`
- [ ] T016 Créer `backend/src/main/resources/application.properties` :
  - port `${PORT:8080}` ;
  - journaux JSON structurés avec `@timestamp` ;
  - `spring.jpa.open-in-view=false` ;
  - Flyway activé ;
  - pool Hikari limité à 5 connexions, avec validation des connexions avant usage.
- [ ] T017 Implémenter `backend/src/main/java/com/priorisationepic/config/DatabaseUrlConfig.java`. Il convertit `DATABASE_URL`, au format `postgresql://user:pass@host[:port]/db?sslmode=require` (celui de Neon), en `spring.datasource.url` JDBC, `username` et `password`, en conservant `sslmode`. Sinon, il laisse `SPRING_DATASOURCE_*` s'appliquer. Ajouter le test `backend/src/test/java/com/priorisationepic/config/DatabaseUrlConfigTest.java`
- [ ] T018 [P] Implémenter `config/AllowedOrigins.java` et `config/WebConfig.java` dans `backend/src/main/java/com/priorisationepic/` : CORS restreint à `ALLOWED_ORIGINS`, aucune origine par défaut. Ajouter les tests `config/AllowedOriginsTest.java`, `config/CorsTest.java` et `config/NoOriginByDefaultTest.java` dans `backend/src/test/java/com/priorisationepic/`. Sur le modèle de PP : `config/`
- [ ] T019 [P] Implémenter `config/JacksonConfig.java` et un test de journalisation JSON `backend/src/test/java/com/priorisationepic/JsonLoggingTest.java`, sur le modèle de PP
- [ ] T020 [P] Implémenter `adapter/in/rest/HealthController.java` (`GET /api/health` qui renvoie `{"status":"UP"}`) et son test `adapter/in/rest/HealthControllerTest.java`, dans `backend/src/main/java/com/priorisationepic/` et `backend/src/test/java/com/priorisationepic/`
- [ ] T021 [P] Implémenter les garde-fous HTTP de PP dans `backend/src/main/java/com/priorisationepic/adapter/in/rest/` : `RequestBodyLimitFilter.java` (limite par défaut ; 5 Mo pour `/api/sessions/*/imports`), `CreationRateLimiter.java` (créations de sessions par adresse) et `ClientAddress.java`. Ajouter leurs tests dans `backend/src/test/java/com/priorisationepic/adapter/in/rest/`
- [ ] T022 Implémenter `adapter/in/rest/RestErrorHandler.java` : Problem Details RFC 9457 avec un `detail` en français, lu dans `backend/src/main/resources/messages.properties`, le catalogue unique des messages d'erreur du back (FR-027)

### Base de données

- [ ] T023 Écrire la migration `backend/src/main/resources/db/migration/V1__init.sql`, conforme à `data-model.md` :
  - `session` : `session_id` varchar(22) en clé primaire, `animation_token_hash`, `name` (1 à 120 caractères), `status` CHECK IN ('PREPARATION','IN_PROGRESS','CLOSED'), `method` varchar(20) not null (pas de CHECK sur la liste des méthodes, validée par `MethodRegistry`), `method_version` int, `scale_type` CHECK IN ('CONTINUOUS','FIBONACCI'), `scale_max` int, `created_at`, `created_by_pseudo`, `version`.
  - `participant` : `id` uuid, `session_id`, `pseudo` (1 à 40 caractères), `role` CHECK IN ('FACILITATOR','PARTICIPANT'), `business_role`, `participant_token_hash`, `joined_at`, `last_seen_at`, avec un index unique sur `(session_id, lower(pseudo))`.
  - `feature` : `id`, `session_id`, `external_id` (1 à 50 caractères), `title` (1 à 200 caractères), `description` (5 000 caractères au plus), **sans colonne de critère**, `marked_for_review` boolean not null default false, `review_reason` (200 caractères au plus), `deleted_at`, `version`, avec un index unique sur `(session_id, lower(external_id))` limité à `deleted_at IS NULL`.
  - `feature_criterion_value` : `feature_id`, `criterion_key` varchar(20), `value` int not null CHECK ≥ 1, clé primaire `(feature_id, criterion_key)` (FR-017b : aucune colonne par critère).
  - `voting_round` : `id`, `session_id`, `number`, `status` CHECK IN ('OPEN','REVEALED'), `previous_round_id`, `opened_at`, `revealed_at`.
  - `round_feature` : clé primaire `(round_id, feature_id)`.
  - `vote` : `id`, `round_id`, `feature_id`, `participant_id`, `updated_at`, avec une contrainte UNIQUE sur `(round_id, feature_id, participant_id)`.
  - `vote_criterion_value` : `vote_id`, `criterion_key` varchar(20), `value` int not null CHECK ≥ 1, clé primaire `(vote_id, criterion_key)`.
  - `change_log` : `id`, `session_id`, `at`, `author_pseudo`, `entity_type` CHECK IN ('SESSION','FEATURE'), `entity_id`, `action` CHECK IN ('VALUE_CHANGE','SCALE_CHANGE'), `field`, `old_value` jsonb, `new_value` jsonb.
  - `import_preview` : `id`, `session_id`, `source_type`, `valid_rows` jsonb, `rejected_rows` jsonb, `warnings` jsonb, `expires_at`.
- [ ] T024 Créer la base de test `backend/src/test/java/com/priorisationepic/PostgresTestBase.java` (Testcontainers `postgres:17`, conteneur partagé, `@DynamicPropertySource`) et un test qui vérifie que les migrations Flyway s'appliquent, dans `backend/src/test/java/com/priorisationepic/adapter/out/persistence/MigrationTest.java`

### Architecture et noyau du domaine

- [ ] T025 Écrire `backend/src/test/java/com/priorisationepic/ArchitectureTest.java` (ArchUnit), sur le modèle de PP : `ArchitectureTest.java`, avec sa fixture `archfixture/domain/PollutedDomainClass.java`. Règles vérifiées :
  - `domain` ne dépend que du JDK ;
  - `application` ne dépend que de `domain` ;
  - les adaptateurs ne dépendent pas les uns des autres ;
  - `config` peut tout voir.
- [ ] T026 [P] Implémenter les objets valeur du domaine dans `backend/src/main/java/com/priorisationepic/domain/` :
  - `SessionId` : 128 bits aléatoires, base64url sans remplissage, 22 caractères ;
  - `Pseudo` : 1 à 40 caractères après suppression des espaces aux extrémités, comparaison insensible à la casse ;
  - `IdGenerator` : générateur injectable.

  Ajouter les tests `SessionIdTest.java`, `PseudoTest.java` et `IdGeneratorTest.java` dans `backend/src/test/java/com/priorisationepic/domain/`. Sur le modèle de PP : `domain/PseudoTest.java`, `domain/IdGeneratorTest.java`
- [ ] T027 [P] Implémenter `domain/Tokens.java` dans `backend/src/main/java/com/priorisationepic/` : génération d'un jeton aléatoire de 256 bits en base64url, et empreinte SHA-256 comparée en temps constant. Ajouter le test `domain/TokensTest.java` dans `backend/src/test/java/com/priorisationepic/`
- [ ] T028 Définir les ports de `application` dans `backend/src/main/java/com/priorisationepic/application/` :
  - `SessionRepository`, `FeatureRepository`, `ParticipantRepository`, `RoundRepository`, `ChangeLogRepository` ;
  - `Broadcaster`, qui envoie un `sessionState` à chaque connexion d'une session ;
  - `ClockPort`.

  Ajouter `SessionLocks.java` (verrou par `sessionId`) et son test `SessionLocksTest.java` dans `backend/src/test/java/com/priorisationepic/application/`. Sur le modèle de PP : `application/SessionLocksTest.java`, `RecordingBroadcaster.java`, `MutableClock.java`
- [ ] T029 Implémenter `application/ChangeLogWriter.java` : il écrit une entrée, dans la même transaction, **uniquement** pour une modification de valeur retenue (`VALUE_CHANGE`, champ = clé du critère de la méthode, par exemple `bv`, et seulement si la valeur change) et pour un changement d'échelle (`SCALE_CHANGE`). Chaque entrée contient l'auteur, la date, le type d'entité (`SESSION` ou `FEATURE`), l'identifiant, l'action, le champ, l'ancienne et la nouvelle valeur en JSON (FR-025, constitution III). Rien d'autre n'est tracé. Ajouter son implémentation JPA dans `adapter/out/persistence/ChangeLogJpaRepository.java`

### Plomberie WebSocket

- [ ] T030 Implémenter `config/WebSocketConfig.java`, sur le modèle de PP : `config/WebSocketConfig.java`. WebSocket brut sur `/ws/sessions/{sessionId}`, origines limitées à `ALLOWED_ORIGINS`, messages entrants de 16 Ko au plus, et `OptionalServerContainerFactoryBean`
- [ ] T031 Implémenter dans `backend/src/main/java/com/priorisationepic/adapter/in/ws/` :
  - `SessionSocketHandler.java` : poignée de main `hello` dans les 5 s, sinon fermeture `1008` ; fermeture `4404` si la session est inconnue ; fermeture `4401` si le jeton de participant est inconnu ; jeton d'animation facultatif ;
  - `WsConnection.java` ;
  - `ClientMessages.java` : désérialisation par `type`, avec `error INVALID_MESSAGE` pour un `type` inconnu ou un schéma invalide ;
  - `ServerMessages.java`.

  Sur le modèle de PP : `adapter/in/ws/`
- [ ] T032 Implémenter le maintien de connexion : ping WebSocket toutes les 5 s, fermeture après 15 s sans pong ni message, `tick` toutes les 5 s, `heartbeat` accepté. Le code va dans `adapter/in/ws/` et `adapter/in/scheduling/`. Ajouter les tests `LivenessTest.java`, `HelloTimeoutTest.java` et `WsConnectionTest.java` dans `backend/src/test/java/com/priorisationepic/adapter/in/ws/`, sur le modèle de PP
- [ ] T033 Implémenter `adapter/in/ws/WebSocketBroadcaster.java`, qui réalise le port `Broadcaster`. Après chaque intention acceptée, il calcule **un `sessionState` par connexion**, filtré pour son destinataire. Ajouter le test `WebSocketBroadcasterTest.java` dans `backend/src/test/java/com/priorisationepic/adapter/in/ws/`
- [ ] T034 [P] Créer le service WebSocket du front `frontend/src/app/session/session-socket.service.ts`, sur le modèle de PP : `frontend/src/app/session/session.service.ts` :
  - fabrique `WebSocket` injectable ;
  - `hello` envoyé à l'ouverture ;
  - `heartbeat` toutes les 5 s ;
  - connexion déclarée perdue après 12 s de silence ;
  - reconnexion immédiate, puis après 1, 2, 4 et 8 s, puis toutes les 10 s ;
  - pas de reconnexion après les codes `4401` ou `4404`.

  Ajouter le test `frontend/src/app/session/session-socket.service.spec.ts`
- [ ] T035 [P] Reprendre de PP la configuration du front, en l'adaptant au projet :
  - `frontend/scripts/write-config.mjs` (`config.json` construit à partir de `API_BASE_URL`) ;
  - `frontend/scripts/inject-csp.mjs` (CSP `connect-src 'self' https://<api> wss://<api>`) ;
  - `frontend/scripts/serve-dist.mjs` ;
  - `frontend/src/app/config/` ;
  - `frontend/src/app/api/` ;
  - `frontend/src/app/storage/` (clés `pe.token.{sessionId}` et `pe.animation.{sessionId}`) ;
  - les tests `node --test` de `frontend/scripts/`.
- [ ] T036 [P] Reprendre de PP la coquille de l'interface, avec le nom de l'application **« Priorisation Fonctionnalités »** (titre de la page d'accueil, balise `<title>` et pastille « PF », textes dans `messages.fr.ts`) : `frontend/src/app/top-bar/`, `theme/`, `wake/` (écran « réveil du service » pendant que l'hébergeur sort de veille) et `app.routes.ts`. Routes : `/`, `/s/:sessionId`, `/s/:sessionId/animer`

**Checkpoint** : la CI est verte, avec Dependabot, CodeQL et Gitleaks actifs et une image qui démarre. Un client peut ouvrir un WebSocket et faire `hello`. Les parcours peuvent commencer.

---

## Phase 3 : User Story 1 — Prioriser en saisie directe (Priority: P1) 🎯 MVP

**Objectif** : l'animateur crée une session, saisit les fonctionnalités et leurs valeurs. Le tableau calcule le CoD et le WSJF, se trie, et se met à jour en direct chez tous les membres connectés.

**Test indépendant** : créer une session, saisir 3 fonctionnalités et leurs valeurs, puis vérifier les CoD, les WSJF et l'ordre du tableau, y compris après modification d'une valeur et dans un second navigateur (quickstart V1 à V3, V14).

### Tests de User Story 1 (à écrire d'abord, ils doivent échouer)

- [ ] T037 [P] [US1] Test de propriétés jqwik `backend/src/test/java/com/priorisationepic/domain/method/WsjfMethodPropertiesTest.java`. Propriétés vérifiées :
  - CoD = BV + TC + RR/OE ;
  - WSJF = CoD / JS, sous forme de fraction exacte ;
  - le tri est total et stable ;
  - la comparaison par produit croisé équivaut à la comparaison des valeurs exactes ;
  - le WSJF n'est jamais calculé si un critère manque ou sort de l'échelle.
- [ ] T038 [P] [US1] Test unitaire `backend/src/test/java/com/priorisationepic/domain/method/RankingTest.java` :
  - scénarios d'acceptation US1 n°1 et 2 : F-1 (8, 5, 3, 4) donne CoD 16 et WSJF « 4,00 » ; avec JS = 10, on obtient « 1,60 » et F-2 (2, 2, 2, 3, soit « 2,00 ») passe en tête ;
  - règle d'égalité : WSJF décroissant, puis CoD décroissant, puis `externalId` croissant insensible à la casse ;
  - fonctionnalités incomplètes en fin de tableau, triées par `externalId` ;
  - arrondi HALF_UP à 2 décimales avec une virgule ;
  - `explanation` vaut « CoD = 8 + 5 + 3 = 16 ; WSJF = 16 / 4 = 4,00 ».
- [ ] T038a [P] [US1] Test de généricité de la méthode `backend/src/test/java/com/priorisationepic/domain/method/MethodGenericityTest.java`, avec une **méthode fictive** déclarée seulement dans les tests, `backend/src/test/java/com/priorisationepic/testmethod/FakeTwoCriteriaMethod.java` (critères `reach` et `effort`, valeur calculée `ratio` = reach / effort, tri par `ratio` décroissant). Cas vérifiés (FR-017a, FR-017b, SC-009) :
  - `MethodRegistry` retrouve une méthode par (`method`, `methodVersion`) ; une version inconnue est refusée ;
  - `Criteria` accepte les clés de la méthode et refuse les autres (`UNKNOWN_CRITERION`), y compris `bv` pour la méthode fictive ;
  - `Score` et `Ranking` fonctionnent pour la méthode fictive sans aucun code propre au WSJF ;
  - la définition du WSJF correspond exactement à la table de `data-model.md` (clés, sigles, noms, définitions, en-têtes, ordre, `display`).
- [ ] T039 [P] [US1] Test unitaire `backend/src/test/java/com/priorisationepic/domain/scale/ScaleTest.java`, limité aux entiers continus : borne « de 2 à 100, 10 par défaut » ; 0, 11 et toute valeur non entière refusés sur l'échelle 1 à 10 ; `allowedValues` vaut 1 à 10
- [ ] T040 [P] [US1] Tests de cas d'usage `backend/src/test/java/com/priorisationepic/application/CreateSessionUseCaseTest.java`, `JoinSessionUseCaseTest.java` et `FeatureUseCaseTest.java`, avec un `RecordingBroadcaster` et un `MutableClock`. Cas vérifiés : Tester aussi la marque « à revoir » : posée et retirée par l'animateur seulement, motif limité à 200 caractères, aucun effet sur le WSJF, le rang ni le tri.
  - un seul `FACILITATOR` par session ;
  - pseudo unique sans tenir compte de la casse ; reprise d'un pseudo après 10 minutes d'absence avec conservation des votes, et refus avant ce délai (avec un `MutableClock`) ; jamais de reprise du rôle d'animateur par pseudo ;
  - `externalId` unique (`DUPLICATE_EXTERNAL_ID`) ;
  - `STALE_VERSION` en cas de version obsolète ;
  - `FORBIDDEN` sans jeton d'animation ;
  - une entrée `change_log` `VALUE_CHANGE` par critère modifié d'une fonctionnalité existante, et **aucune** pour une création, une modification de titre ou de description, ou une suppression.
- [ ] T041 [P] [US1] Tests de contrat REST `backend/src/test/java/com/priorisationepic/adapter/in/rest/SessionControllerTest.java` et `ContractRoundTripTest.java` (avec `PostgresTestBase`) pour `POST /api/sessions`, `POST /api/sessions/{sessionId}/participants` (201 et 409 PseudoTaken) et `GET /api/sessions/{sessionId}`. Les réponses doivent être valides contre `contract/schemas/`
- [ ] T042 [P] [US1] Tests WebSocket de bout en bout `backend/src/test/java/com/priorisationepic/adapter/in/ws/FeatureIntentsTest.java` et `WsContractRoundTripTest.java`. Intentions `addFeature`, `updateFeature` et `deleteFeature` : seul l'animateur peut écrire, un `sessionState` est diffusé à 2 connexions, `error STALE_VERSION`, `INVALID_VALUE` et `DUPLICATE_EXTERNAL_ID`. Vérifier aussi la mise à jour de `lastSeenAt` au `heartbeat` (au plus une fois toutes les 30 s) et à la fermeture de la dernière connexion. Les messages sérialisés doivent être valides contre le contrat
- [ ] T043 [P] [US1] Tests Vitest du tableau `frontend/src/app/board/board.component.spec.ts` et du panneau de détail `frontend/src/app/board/feature-detail-panel.component.spec.ts` (ouverture au clic sur l'identifiant, fermeture par la croix, Échap ou un clic à côté, descriptif complet affiché, valeurs et calcul masqués pour un participant pendant un tour ouvert, mode édition avec « Enregistrer » qui envoie une seule intention et « Annuler » qui n'envoie rien). Le tableau affiche les colonnes rang, identifiant, titre, puis **les critères et les valeurs calculées de `methodDefinition`** (en WSJF : BV, TC, RR/OE, JS, CoD et WSJF), dans l'ordre reçu. Un second cas, avec une `methodDefinition` fictive à deux critères, vérifie que les colonnes, les champs de saisie et les aides suivent cette définition sans code propre au WSJF (SC-009). Une fonctionnalité incomplète affiche « non calculé ». `explanation` est affiché tel quel

### Contrat de User Story 1

- [ ] T044 [US1] Ajouter au contrat :
  - les schémas `contract/schemas/create-session-request.json`, `create-session-response.json`, `join-session-request.json`, `join-session-response.json`, `add-feature.json`, `update-feature.json`, `delete-feature.json`, `criterion-key.json`, `criteria.json` (objet indexé par clé de critère, sans liste de critères), `exact-value.json`, `method-definition.json`, `score.json`, `feature.json` et `session-state.json` (sans les tours, avec `methodDefinition`) ;
  - leurs exemples dans `contract/examples/` ;
  - les opérations correspondantes dans `contract/openapi.yaml` et `contract/asyncapi.yaml`.

  Contraintes à reprendre telles quelles : `name` de 1 à 120 caractères, `pseudo` de 1 à 40, `externalId` de 1 à 50, `title` de 1 à 200, `description` de 5 000 au plus, critères entiers ≥ 1 ou null. Ajouter à `validate.test.mjs` un cas qui vérifie qu'**aucun schéma ne nomme un critère du WSJF** (`bv`, `tc`, `rrOe`, `js`, `cod`, `wsjf`) en dehors des exemples.

### Implémentation de User Story 1

- [ ] T045 [P] [US1] Implémenter `domain/scale/Scale.java` et `ScaleType.java` dans `backend/src/main/java/com/priorisationepic/` : type `CONTINUOUS` uniquement à ce stade (`FIBONACCI` arrive en US3), `accepts(int)`, `allowedValues()`, borne de 2 à 100 avec 10 par défaut
- [ ] T046 [P] [US1] Implémenter dans `backend/src/main/java/com/priorisationepic/domain/method/` :
  - `PrioritizationMethod.java` (interface : `definition()`, `compute(criteria)`, `explain(criteria)`, `compare(a, b)`), `MethodDefinition.java`, `CriterionDefinition.java`, `ComputedValueDefinition.java` et `MethodRegistry.java` (méthodes par `method` et `methodVersion`) ;
  - `WsjfMethod.java` : seule implémentation, `methodVersion` 1, avec la définition de `data-model.md` (clés, sigles, noms, définitions en français, en-têtes, `display`), `formula` « CoD = BV + TC + RR/OE ; WSJF = CoD / JS » et `tieBreakRule` en français. C'est **la seule classe du back qui connaît BV, TC, RR/OE, JS, CoD et WSJF** ;
  - `Criteria.java` : valeurs par clé de critère, validées contre la définition (`UNKNOWN_CRITERION`) ;
  - `Fraction.java` et `Score.java` : `complete`, `outOfScale`, `computed` (fractions exactes par clé, affichage selon `display`, « 0,00 » HALF_UP pour `DECIMAL_2`), `explanation`, `rank` ;
  - `Ranking.java` : générique, tri FR-014 par `compare` de la méthode, puis `externalId`.
- [ ] T047 [P] [US1] Implémenter les agrégats `domain/Session.java`, `domain/Participant.java` et `domain/Feature.java` dans `backend/src/main/java/com/priorisationepic/`, avec les règles de `data-model.md` : statut initial `PREPARATION`, méthode `WSJF` version 1 par défaut (lue dans `MethodRegistry`), échelle par défaut ; rôle `FACILITATOR` ou `PARTICIPANT` ; `deletedAt` pour la suppression douce ; `version`
- [ ] T048 [US1] Implémenter l'adaptateur de persistance dans `backend/src/main/java/com/priorisationepic/adapter/out/persistence/` : entités JPA avec `@Version` pour `session`, `participant` et `feature` (valeurs dans `feature_criterion_value`, en collection d'éléments indexée par `criterion_key`), repositories Spring Data, et réalisation des ports `SessionRepository`, `ParticipantRepository` et `FeatureRepository`. Ajouter le test d'intégration `adapter/out/persistence/SessionPersistenceTest.java` (avec `PostgresTestBase`). Activer le job `journeys` dans `.github/workflows/ci.yml` sur le modèle de PP, avec un service PostgreSQL 17 et `npx playwright install --with-deps chromium firefox webkit`
- [ ] T049 [US1] Implémenter `application/CreateSessionUseCase.java` et `application/JoinSessionUseCase.java` :
  - à la création, le créateur devient `FACILITATOR` et reçoit `participantToken` et `animationToken` ; seules leurs empreintes sont stockées (FR-001, FR-002) ;
  - à l'arrivée d'un participant, remise du `participantToken` (FR-003). Si le pseudo est déjà pris, deux cas :
    - le participant existant est absent depuis au moins 10 minutes (aucune connexion ouverte, `lastSeenAt`, propriété `priorisation-epic.absence-timeout`, `10m` par défaut comme dans PP) : le nouvel arrivant est **rattaché à ce participant**, avec ses votes, un nouveau jeton est émis et l'ancienne empreinte est remplacée ;
    - sinon, réponse `409 PseudoTaken`.

    Le rôle `FACILITATOR` ne se reprend jamais de cette façon (FR-002).
- [ ] T050 [US1] Implémenter `application/FeatureUseCase.java` (intentions `addFeature`, `updateFeature` et `deleteFeature`, FR-006, FR-015) : Gérer aussi la marque « à revoir » (FR-006a) : `markedForReview` et `reviewReason` (200 caractères au plus, vidé quand la marque est retirée), réservée à l'animateur, acceptée même pendant un tour ouvert, sans effet sur le score ni le tri.
  - réservé à l'animateur ;
  - exécuté sous `SessionLocks` ;
  - vérifie la `version` ;
  - valide les clés de critère avec la définition de la méthode (`UNKNOWN_CRITERION`), puis les valeurs avec `Scale` ;
  - écrit dans `ChangeLogWriter` pour les seuls changements de valeur d'un critère ;
  - appelle `Broadcaster`.

  La suppression est douce (`deletedAt`). Si la session est en `IN_PROGRESS`, le front demande une confirmation avant de l'envoyer
- [ ] T051 [US1] Implémenter `application/SessionStateAssembler.java` : il construit le `sessionState` d'un destinataire (`version`, `methodDefinition`, `formula`, `tieBreakRule`, `scale.allowedValues`, `me`, `participants` avec `online`, `features` triées par `Ranking`). Le filtrage des tours sera ajouté en US2
- [ ] T052 [US1] Implémenter les contrôleurs REST dans `backend/src/main/java/com/priorisationepic/adapter/in/rest/` : `SessionController.java` (`POST /api/sessions` avec `CreationRateLimiter` ; `GET /api/sessions/{sessionId}`, qui renvoie la vue d'un participant non animateur) et `JoinSessionController.java` (`POST /api/sessions/{sessionId}/participants`), avec leurs DTO
- [ ] T053 [US1] Brancher les intentions de fonctionnalité et la présence dans `adapter/in/ws/SessionSocketHandler.java` :
  - `hello` avec un `animationToken` valide accorde les droits d'animateur sur ce poste (FR-002, prise de rôle depuis un autre navigateur) ;
  - `online` est mis à jour à l'ouverture et à la fermeture de chaque connexion (FR-005) ;
  - `lastSeenAt` est mis à jour à chaque `heartbeat` (au plus une fois toutes les 30 s en base) et à la fermeture de la dernière connexion du participant. C'est le point de départ des 10 minutes d'absence de T049.
- [ ] T054 [P] [US1] Front, page d'accueil `frontend/src/app/home/` : formulaire de création (nom de session et pseudo). Après création, enregistrer les jetons dans `storage`, afficher le lien d'invitation et le **lien d'animation privé** (`/s/{sessionId}/animer#{animationToken}`) avec un avertissement « à garder pour vous », puis rediriger vers la session
- [ ] T055 [P] [US1] Front, écran d'entrée `frontend/src/app/session/join/` : saisie du pseudo, `POST /participants`, message « pseudo déjà utilisé ». La route `/s/:sessionId/animer` lit le fragment, enregistre `pe.animation.{sessionId}`, puis efface le fragment de l'URL
- [ ] T056 [US1] Front, tableau `frontend/src/app/board/board.component.ts` : il affiche `sessionState.features` dans l'ordre reçu, avec une colonne par critère puis par valeur calculée de `sessionState.methodDefinition` (aucune colonne écrite en dur, FR-017b), avec un badge « à revoir » (motif au survol) pour les fonctionnalités marquées et la mention « hors échelle » pour celles dont une valeur sort de l'échelle (disposition des écrans 4 et 5 des maquettes), **sans défilement de la page** dans une fenêtre de 1280 × 720 (FR-014a) : mise en page en hauteur de fenêtre, seule la liste du tableau défile avec un en-tête figé, titres longs tronqués avec points de suspension, panneau latéral à défilement séparé ; avec la formule et la règle d'égalité en légende (constitution I) et la liste des participants en ligne (FR-005). Les identifiants sont des liens qui ouvrent le **panneau de détail** `frontend/src/app/board/feature-detail-panel.component.ts` (FR-016, FR-016b, écran 4 ter des maquettes) : identifiant, rang, titre, descriptif complet, valeurs retenues avec le nom complet des critères, détail du calcul (`score.explanation`) et contribution de chaque critère. Pour l'animateur, un bouton « Marquer à revoir » (avec un champ motif facultatif de 200 caractères au plus) ou « Retirer la marque » (FR-006a), et un bouton « Modifier le titre et le descriptif » qui passe le panneau en mode édition (champ titre de 1 à 200 caractères, descriptif de 5 000 caractères au plus) avec « Enregistrer » et « Annuler ». « Enregistrer » envoie une seule intention `updateFeature` avec la `version` ; le `sessionState` diffusé met le titre et le descriptif à jour chez tous les membres ; un message « Modification enregistrée et visible par tous les participants » s'affiche ; en cas de `STALE_VERSION`, la version actuelle est montrée avant de confirmer. « Annuler » restaure le contenu sans rien envoyer. Sur téléphone, le panneau occupe tout l'écran. Le panneau sert aussi dans le panneau de vote, la révélation et le choix des fonctionnalités d'un tour
- [ ] T057 [P] [US1] Front, composants d'aide de la méthode (FR-016a) : `frontend/src/app/shared/criterion-term.component.ts` (sigle souligné en pointillés, avec la définition affichée au survol, au focus clavier et au toucher, et annoncée aux lecteurs d'écran par `aria-label`) et `frontend/src/app/shared/method-glossary.component.ts` (encadré « Comprendre le <nom de la méthode> », soit « Comprendre le WSJF », **repliable et dépliable**, état mémorisé dans `localStorage` sous `pe.glossary`, ouvert par défaut). Les sigles, noms et définitions viennent de `sessionState.methodDefinition` ; seuls les textes génériques (« Comprendre le », « Replier ») sont dans `messages.fr.ts`. Les utiliser dans les en-têtes du tableau (T056) et dans le panneau latéral, comme sur les écrans 4 et 5 des maquettes. Ajouter le test Vitest `frontend/src/app/shared/criterion-term.component.spec.ts` (définition présente au focus clavier, `aria-label` complet) et `method-glossary.component.spec.ts` (repli et dépli, état mémorisé, contenu tiré de la définition)
- [ ] T058 [US1] Front, édition par l'animateur `frontend/src/app/board/feature-editor.component.ts` :
  - ajout, modification et suppression avec confirmation ;
  - saisie directe des valeurs dans la ligne, un champ par critère de `methodDefinition`, contrôlée côté front (entier, dans l'échelle, dans la suite en Fibonacci) puis côté serveur ;
  - envoi d'une seule intention `updateFeature` quand l'animateur clique sur « Enregistrer ». Le tableau ne se retrie qu'à ce moment (FR-015), et la ligne en cours de saisie ne bouge pas ;
  - envoi de la `version` ;
  - en cas de `STALE_VERSION`, la valeur actuelle s'affiche avant de confirmer ou d'annuler ;
  - messages d'erreur français tirés de `messages.fr.ts` (FR-027).
- [ ] T059 [P] [US1] Front, action « Afficher mon lien d'animation » dans `frontend/src/app/session/animation-link.component.ts` (FR-002, cas limite « Lien d'animation perdu ») : visible seulement pour l'animateur, elle reconstruit le lien `/s/{sessionId}/animer#{animationToken}` à partir du jeton `pe.animation.{sessionId}` stocké dans le navigateur, l'affiche avec un bouton « Copier » et l'avertissement « à garder pour vous ». Aucun appel serveur : le serveur ne connaît que l'empreinte du jeton. Ajouter le test Vitest `frontend/src/app/session/animation-link.component.spec.ts`
- [ ] T060 [US1] Écrire les tests e2e Playwright `frontend/e2e/board.spec.ts` (avec un faux socket, sur le modèle de PP : `e2e/fake-session-socket.ts`, et les contrôles axe-core), avec un cas « téléphone » (fenêtre de 390 px : tableau en cartes, aucune action de saisie, bandeau « Pour voter ou modifier, utilisez un ordinateur »), et un cas « le tableau ne se retrie qu'à « Enregistrer » », et un cas « fenêtre 1280 × 720 avec 50 fonctionnalités : la page ne défile pas (`document.documentElement.scrollHeight <= innerHeight`), seule la liste défile », puis les parcours `frontend/e2e-journeys/us1-saisie-directe.spec.ts` (quickstart V1, V2, V3, V14 et V16 : définitions WSJF au survol, encadré repliable, panneau de descriptif et modification du titre visible dans un second navigateur, avec deux navigateurs et une propagation en moins de 2 s, SC-002)

**Checkpoint** : US1 fonctionne et se teste seule. C'est le MVP.

---

## Phase 4 : Déploiement V1 (Render et Neon), après le MVP

**Objectif** : mettre le MVP en ligne sur Render, avec la base sur Neon. On peut lancer cette phase dès que la phase 3 est terminée, ou plus tard (plan, « Ordre de mise en place »).

- [ ] T061 [P] Créer `deploy/render.yaml` sur le modèle de PP : `deploy/render.yaml` :
  - Web Service Docker `priorisation-epic-api` : `rootDir backend`, `healthCheckPath /api/health`, région `frankfurt`, `autoDeployTrigger "off"`, variables `PORT`, `ALLOWED_ORIGINS` (`sync: false`) et `DATABASE_URL` (`sync: false`, la chaîne Neon) ;
  - Static Site `priorisation-epic` : `npm ci && npm run build`, `staticPublishPath ./dist/frontend/browser`, réécriture `/* → /index.html`, en-têtes de sécurité de PP, `API_BASE_URL` et `NODE_VERSION 24`.
- [ ] T062 [P] Reprendre de PP `deploy/render-deploy.sh`, `deploy/render-deploy.test.sh` et `.github/workflows/deploy.yml` (étiquette `v*` sur la tête de `main`, l'API d'abord, puis le front). Ajouter le job `deploy-script` dans `.github/workflows/ci.yml`
- [ ] T063 Rédiger `deploy/README.md` sur le modèle de PP, en y ajoutant :
  - la création du projet Neon `priorisation-epic` en région AWS Europe (Frankfurt), avec l'adresse directe (sans `-pooler`) et `sslmode=require` ;
  - les limites de l'offre gratuite de Neon : 0,5 Go, mise en veille après 5 minutes, restauration sur 6 heures ;
  - la consigne « ne pas saisir de données confidentielles tant que l'application est sur Neon » ;
  - la sauvegarde par export JSON après chaque atelier ;
  - la liste des secrets GitHub du déploiement ;
  - le rappel de la règle de publication : aucune alerte Dependabot ou CodeQL haute ou critique ouverte avant une étiquette `v*` (voir `README.md`, section « Sécurité du dépôt »).

**Checkpoint** : `https://<api>.onrender.com/api/health` répond `UP`, et le parcours US1 fonctionne en ligne.

---

## Phase 5 : User Story 2 — Vote masqué puis consensus (Priority: P2)

**Objectif** : l'animateur ouvre des tours de vote masqués sur une sélection de fonctionnalités, les participants votent sans voir les votes des autres, puis l'animateur révèle le tour, fixe le consensus et peut relancer un tour sur les désaccords. Il peut aussi transmettre son rôle.

**Test indépendant** : un animateur et deux participants, sur trois navigateurs. Aucun ne voit les votes des autres ni les valeurs masquées avant la révélation (quickstart V4 à V8).

### Tests de User Story 2 (à écrire d'abord, ils doivent échouer)

- [ ] T064 [P] [US2] Test unitaire `backend/src/test/java/com/priorisationepic/domain/SessionStatusTest.java` (démarrage) : `PREPARATION → IN_PROGRESS` par l'intention `START`, réservée à l'animateur ; un `START` sur une session déjà en cours ne change rien ; un tour ne s'ouvre qu'en `IN_PROGRESS`
- [ ] T065 [P] [US2] Test unitaire `backend/src/test/java/com/priorisationepic/domain/round/VotingRoundTest.java` :
  - au moins une fonctionnalité par tour ;
  - une fonctionnalité ne peut être que dans un seul tour `OPEN` (`FEATURE_IN_OPEN_ROUND`) ;
  - `OPEN → REVEALED` est la seule transition possible ;
  - un tour `REVEALED` est immuable (`ROUND_REVEALED`) ;
  - relance à partir de `previousRoundId` sur une sélection des fonctionnalités du tour précédent ;
  - minimum et maximum pour chaque critère de la méthode (aucune liste écrite en dur ; un cas avec la méthode fictive de T038a), calculés sur les seules valeurs saisies : un critère « sans avis » (vide) est ignoré, et un critère sans aucune valeur a un minimum et un maximum vides (FR-020) ;
  - `largeSpread` : un critère est en écart important si et seulement si maximum moins minimum est **strictement supérieur à 3** (cas limites : 3 donne non, 4 donne oui) ;
  - `unanimous` : valeur d'un critère si **tous ceux qui ont donné une valeur** pour ce critère ont saisi la même, sinon vide. Les non-votants et les « sans avis » sont ignorés. Un critère sans aucune valeur donne vide (cas : alice laisse JS vide, eric saisit 4, donc `unanimous.js` = 4) ;
  - « n'a pas voté » signalé pour un participant sans aucune valeur sur la fonctionnalité ; un vote avec au moins un critère compte comme voté, et compte dans `completedCount`.
- [ ] T066 [P] [US2] Test unitaire de visibilité `backend/src/test/java/com/priorisationepic/domain/round/VisibilityTest.java` (FR-019, FR-019a, SC-004). Pendant un tour `OPEN` :
  - le destinataire ne voit que ses propres votes ;
  - `results` vaut null ;
  - pour un non-animateur, les fonctionnalités du tour ont des critères et un `score` null, `votingInProgress` vaut true, elles sont placées en fin de tableau, et les votes des tours précédents sont masqués ;
  - l'animateur voit les valeurs retenues, mais pas les votes en cours ;
  - `progress` est toujours visible.
- [ ] T067 [P] [US2] Tests de cas d'usage `backend/src/test/java/com/priorisationepic/application/RoundUseCaseTest.java`, `VoteUseCaseTest.java` et `TransferFacilitatorUseCaseTest.java`. `openRound` en `PREPARATION` renvoie `SESSION_NOT_STARTED` (FR-004, FR-018). Pendant un tour ouvert, `updateFeature` qui change un critère d'une fonctionnalité du tour, ou `deleteFeature` sur elle, renvoie `FEATURE_IN_OPEN_ROUND` sans rien modifier ; un changement de titre ou de description reste accepté ; après révélation, la saisie redevient possible. Transmission vers un participant sans connexion ouverte : `PARTICIPANT_OFFLINE`, sans aucun changement. Pour une transmission valide (FR-002a) : l'ancien animateur devient `PARTICIPANT`, le nouveau jeton n'est envoyé qu'au bénéficiaire, et l'ancien jeton reçoit `FORBIDDEN` La révélation d'un tour retire la marque « à revoir » de ses fonctionnalités (FR-006a).
- [ ] T068 [P] [US2] Test WebSocket multi-connexions `backend/src/test/java/com/priorisationepic/adapter/in/ws/MaskedRoundEndToEndTest.java`, avec 3 connexions (animateur, alice, bob). **Aucune trame envoyée à bob ne contient une valeur d'alice** avant `revealRound`, et toutes la contiennent après Vérifier aussi que le `sessionState` reçu par un participant, qui alimente le tableau comme le panneau de détail (FR-016b), ne contient aucune valeur ni aucun score d'une fonctionnalité en cours de vote.
- [ ] T069 [P] [US2] Tests Vitest `frontend/src/app/rounds/vote-panel.component.spec.ts` et `reveal-results.component.spec.ts`

### Contrat de User Story 2

- [ ] T070 [US2] Ajouter au contrat :
  - les schémas `contract/schemas/open-round.json`, `cast-vote.json`, `reveal-round.json`, `transfer-facilitator.json`, `facilitator-handover.json`, `change-status.json` (`START` en US2 ; `CLOSE` et `REOPEN` ajoutés en US5) et `round.json`, les codes d'erreur `SESSION_NOT_STARTED` et `PARTICIPANT_OFFLINE` dans `error.json`, et compléter `session-state.json` avec `openRounds` et `lastRevealedRounds` ;
  - leurs exemples, dont `examples/session-state/open-round-participant.json`, `open-round-facilitator.json` et `revealed-with-non-voter.json`.

  Étendre `contract/scripts/validate.mjs` avec les règles de masquage, et `validate.test.mjs` avec des cas falsifiés qui doivent échouer. Règles à vérifier :
  - pendant un tour `OPEN`, `results` vaut null ;
  - `myVotes` ne contient que les votes du destinataire ;
  - pour un non-animateur, les fonctionnalités `votingInProgress` ont des critères et un `score` null.

### Implémentation de User Story 2

- [ ] T071 [P] [US2] Implémenter `domain/SessionStatus.java` (transition `START`) et `application/ChangeStatusUseCase.java` (intention `changeStatus` avec `START` seulement à ce stade), puis brancher l'intention dans `adapter/in/ws/SessionSocketHandler.java`, dans `backend/src/main/java/com/priorisationepic/`
- [ ] T072 [P] [US2] Implémenter `domain/round/VotingRound.java`, `domain/round/Vote.java` et `domain/round/RoundResults.java` (minimum, maximum, `largeSpread`, `unanimous`) dans `backend/src/main/java/com/priorisationepic/`
- [ ] T073 [P] [US2] Implémenter `domain/round/Visibility.java` : les règles de masquage par destinataire, utilisées par `SessionStateAssembler`, par `GET /api/sessions/{id}` et par les exports
- [ ] T074 [US2] Implémenter la persistance des tours dans `backend/src/main/java/com/priorisationepic/adapter/out/persistence/` : entités `voting_round`, `round_feature` et `vote`, et réalisation de `RoundRepository`
- [ ] T075 [US2] Dans `application/FeatureUseCase.java`, refuser avec `FEATURE_IN_OPEN_ROUND` toute modification des critères et toute suppression d'une fonctionnalité qui est dans un tour `OPEN` (FR-018). Implémenter `application/RoundUseCase.java` (intentions `openRound` et `revealRound`, réservées à l'animateur, sous verrou de session ; `openRound` refusé en `PREPARATION` avec `SESSION_NOT_STARTED` ; `revealRound` retire la marque « à revoir » des fonctionnalités du tour, FR-006a) et `application/VoteUseCase.java` (intention `castVote` ; tout membre peut voter, l'animateur compris ; valeurs validées par `Scale`)
- [ ] T076 [US2] Implémenter `application/TransferFacilitatorUseCase.java` : refus avec `PARTICIPANT_OFFLINE` si le bénéficiaire n'a aucune connexion ouverte (FR-002a) ; sinon `transferFacilitator`, puis envoi de `facilitatorHandover` aux seules connexions du bénéficiaire, puis mise à jour du `sessionState` de tous
- [ ] T077 [US2] Étendre `application/SessionStateAssembler.java` avec `Visibility`, `openRounds` (`progress`, `myVotes`, `results`) et `lastRevealedRounds`. Brancher les intentions de tour, de vote et de transmission dans `adapter/in/ws/SessionSocketHandler.java`
- [ ] T078 [P] [US2] Front, `frontend/src/app/rounds/open-round-dialog.component.ts`, selon l'écran 4 bis des maquettes : l'animateur sélectionne une, plusieurs ou toutes les fonctionnalités par des cases à cocher, avec une recherche par identifiant ou titre et des sélections rapides (« Tout sélectionner », « Non évaluées » pour les fonctionnalités incomplètes, « Hors échelle » pour celles dont une valeur sort de l'échelle, « À revoir » pour celles marquées par l'animateur (FR-006a), « Tout désélectionner »). Chaque ligne affiche l'état (WSJF, non évaluée, hors échelle) et le badge « à revoir » éventuel. Les fonctionnalités déjà dans un tour ouvert sont désactivées, avec la mention « déjà dans le tour N ». Le bouton indique le nombre choisi (« Ouvrir le tour (3 fonctionnalités) ») et reste désactivé tant que rien n'est coché. Ajouter le test Vitest `frontend/src/app/rounds/open-round-dialog.component.spec.ts` L'identifiant de chaque fonctionnalité est un lien qui ouvre `feature-detail-panel` (FR-016b).
- [ ] T079 [P] [US2] Front, `frontend/src/app/rounds/vote-panel.component.ts` : le participant saisit un nombre pour chaque critère de `methodDefinition` (en WSJF : BV, TC, RR/OE et JS) et pour chaque fonctionnalité du tour, par **saisie directe** (FR-019). Chaque champ affiche le `code` et le `label` du critère, par exemple « BV · Business Value », sans la définition, qui est dans l'encadré « Comprendre le WSJF » (FR-016a, écran 5 des maquettes). Un nombre non entier, hors échelle ou hors suite de Fibonacci est refusé avec le message « Saisissez un nombre entier entre 1 et {max} » ou « Valeurs autorisées : 1, 2, 3, 5, 8, 13 ». Un champ peut rester vide : il vaut « sans avis » (FR-019), le texte d'aide l'indique et le champ vide affiche « sans avis ». La fonctionnalité passe « Noté » dès qu'un critère a une valeur. Ajouter ces cas au test `vote-panel.component.spec.ts`. La progression de chacun s'affiche (« alice : 1/2 »). Dans le tableau, les fonctionnalités en vote sont marquées « vote en cours ». Pour l'animateur, l'édition des valeurs et la suppression de ces lignes sont désactivées, avec l'infobulle « Cette fonctionnalité est en cours de vote : révélez le tour avant de modifier ses valeurs » L'identifiant de chaque fonctionnalité est un lien qui ouvre `feature-detail-panel` (FR-016b). Mise en page sans défilement de la page dans une fenêtre de 1280 × 720 (FR-014a, écran 5) : le panneau de vote et le tableau défilent chacun de leur côté.
- [ ] T080 [P] [US2] Front, `frontend/src/app/rounds/reveal-results.component.ts` : Mise en page sans défilement de la page dans une fenêtre de 1280 × 720 (FR-014a, écran 6) : seule la liste des fonctionnalités révélées défile, la barre d'actions reste visible.
  - votes par participant, avec « sans avis » pour un critère vide, minimum et maximum par critère calculés sans les « sans avis », et « n'a pas voté » ; une colonne par critère de `methodDefinition`, en-têtes avec `criterion-term` (FR-016a) ;
  - badge « écart important » sur les critères de `largeSpread` (maximum moins minimum > 3, FR-020) ;
  - l'animateur saisit les valeurs communes (intention `updateFeature`). Les champs sont **vides**, sauf ceux préremplis par `unanimous` (FR-021) ;
  - bouton « Relancer un tour sur la sélection ».
  - l'identifiant de chaque fonctionnalité est un lien qui ouvre `feature-detail-panel` (FR-016b).
- [ ] T081 [P] [US2] Front, bouton « Démarrer la session » pour l'animateur dans `frontend/src/app/session/session-status.component.ts`. Tant que la session est en préparation, l'action « Ouvrir un tour » est désactivée, avec l'explication « Démarrez la session pour ouvrir un tour de vote »
- [ ] T082 [US2] Front, liste des participants avec l'action « Transmettre le rôle d'animateur » dans `frontend/src/app/session/participants.component.ts`. L'action est désactivée pour les participants hors ligne, avec l'infobulle « Ce participant n'est pas connecté ». Gérer `facilitatorHandover` : enregistrer le jeton et afficher le nouveau lien d'animation au bénéficiaire
- [ ] T083 [US2] Écrire les tests e2e `frontend/e2e/rounds.spec.ts` (faux socket et axe-core) et le parcours `frontend/e2e-journeys/us2-vote-masque.spec.ts` (quickstart V4 à V8, trois contextes de navigateur, vérification SC-004) Vérifier aussi, dans une fenêtre de 1280 × 720 avec un tour de 10 fonctionnalités, que les écrans du tour en cours et de la révélation ne font pas défiler la page (FR-014a).

**Checkpoint** : US1 et US2 fonctionnent indépendamment.

---

## Phase 6 : User Story 3 — Import Excel et réglage de l'échelle (Priority: P3)

**Objectif** : l'animateur importe des fonctionnalités depuis Excel, CSV ou JSON avec un aperçu, télécharge le modèle, et choisit le type et la borne de l'échelle.

**Test indépendant** : importer 20 lignes dont 2 invalides, puis passer en Fibonacci avec la borne 13 alors que des valeurs 4 et 10 existent (quickstart V9 et V10).

### Tests de User Story 3 (à écrire d'abord, ils doivent échouer)

- [ ] T084 [P] [US3] Compléter `backend/src/test/java/com/priorisationepic/domain/scale/ScaleTest.java` pour Fibonacci : valeurs {1, 2, 3, 5, 8, 13, 20, 40, 100} jusqu'à la borne, 20 par défaut, borne obligatoirement dans la suite, 4 et 10 refusés avec la borne 13. Ajouter un test de propriétés jqwik sur `accepts` et `allowedValues`
- [ ] T085 [P] [US3] Test `backend/src/test/java/com/priorisationepic/application/UpdateSettingsUseCaseTest.java` : `updateSettings` sans `confirm` renvoie `error SCALE_IMPACT` avec `impactedValues` (externalId, clé de critère, value). Avec `confirm`, l'échelle est appliquée, les valeurs hors échelle apparaissent dans `outOfScale` et la fonctionnalité sort du calcul (FR-011). Une entrée `SCALE_CHANGE` est écrite dans `change_log`. Tant qu'un tour est `OPEN`, un changement d'échelle renvoie `ROUND_OPEN` sans rien modifier, alors qu'un simple renommage est accepté
- [ ] T086 [P] [US3] Tests de lecture `backend/src/test/java/com/priorisationepic/adapter/out/io/XlsxFeatureReaderTest.java`, `CsvFeatureReaderTest.java` et `JsonSessionReaderTest.java`, avec des fichiers de test dans `backend/src/test/resources/imports/`. Cas vérifiés (`contracts/file-formats.md`) :
  - en-têtes imposés, insensibles à la casse et aux espaces, ceux des critères étant lus dans la définition de la méthode ; un cas avec la méthode fictive de T038a (colonnes `Reach` et `Effort` lues, colonne `BV` ignorée et signalée) ;
  - JSON produit avec une autre méthode refusé en entier, avec le message qui nomme les deux méthodes ;
  - fichier refusé en entier sans `Identifiant` ou sans `Titre` ;
  - lignes vides ignorées ;
  - rejet pour identifiant vide ou en double (dans la session ou dans le fichier), ou titre vide ;
  - valeur hors échelle : la ligne est importée sans cette valeur, avec un avertissement ;
  - séparateur `;` ou `,` détecté ;
  - BOM accepté ;
  - limites de 5 Mo et de 1 000 lignes.
- [ ] T087 [P] [US3] Test de contrat REST `backend/src/test/java/com/priorisationepic/adapter/in/rest/ImportControllerTest.java` :
  - l'aperçu n'écrit rien ;
  - la confirmation applique les lignes en une seule transaction, puis diffuse un `sessionState` ;
  - un aperçu expiré renvoie 404 ;
  - un appelant sans jeton d'animation reçoit 403 ;
  - un fichier trop gros reçoit 413 ;
  - `GET /api/import-template.xlsx` renvoie le modèle du WSJF par défaut, et celui d'une autre méthode avec `?method=…&methodVersion=…`.

### Contrat de User Story 3

- [ ] T088 [US3] Ajouter au contrat les schémas `contract/schemas/update-settings.json`, `import-preview.json` et `import-result.json`, leurs exemples (dont `examples/error/scale-impact.json`), et les opérations d'import dans `contract/openapi.yaml`

### Implémentation de User Story 3

- [ ] T089 [P] [US3] Étendre `domain/scale/Scale.java` avec `FIBONACCI` et `impactOf(newScale, features)`
- [ ] T090 [US3] Implémenter `application/UpdateSettingsUseCase.java` (intention `updateSettings` : nom, échelle et `confirm` ; changement d'échelle refusé avec `ROUND_OPEN` tant qu'un tour est ouvert, FR-011) et le brancher dans `adapter/in/ws/SessionSocketHandler.java`
- [ ] T091 [P] [US3] Implémenter `adapter/out/io/XlsxFeatureReader.java` (Apache POI XSSF, première feuille, première ligne non vide comme en-tête, formules lues par leur valeur calculée) et `adapter/out/io/ImportTemplateWriter.java` (feuille « Fonctionnalités », en-têtes `Identifiant`, `Titre`, `Description` puis les `header` des critères de la méthode, soit `BV`, `TC`, `RR/OE`, `JS` en WSJF, et la ligne d'exemple `F-1 | Exemple de fonctionnalité | Description facultative | 8 | 5 | 3 | 4`)
- [ ] T092 [P] [US3] Implémenter `adapter/out/io/CsvFeatureReader.java` (Commons CSV, UTF-8 avec ou sans BOM, `;` ou `,`, guillemets RFC 4180 ; colonnes de critères lues dans la définition de la méthode ; colonnes `Rang` et valeurs calculées de la méthode, soit `CoD` et `WSJF` en WSJF, ignorées)
- [ ] T093 [P] [US3] Implémenter `adapter/out/io/JsonSessionReader.java` (`formatVersion` 1 ; `criteria` indexé par clé ; fichier refusé si `method` ou `methodVersion` diffère de la session ; `computed` et `rank` recalculés, avec un avertissement en cas d'écart ; `rounds` et votes **ignorés** (jamais réimportés, constitution VI) ; échelle du fichier appliquée si la session est en `PREPARATION` et sans fonctionnalité)
- [ ] T094 [US3] Implémenter `application/ImportUseCase.java` (aperçu stocké dans `import_preview` avec `expiresAt` à la création plus 15 min ; confirmation en une seule transaction, puis `Broadcaster`), `adapter/in/rest/ImportController.java` et `adapter/in/scheduling/ImportPreviewPurgeScheduler.java`
- [ ] T095 [P] [US3] Front, `frontend/src/app/import-export/import-dialog.component.ts` :
  - choix du fichier, puis aperçu des lignes valides, rejetées avec leur motif, et des avertissements ;
  - confirmation ou annulation ;
  - récapitulatif final ;
  - lien « Télécharger le modèle ».
- [ ] T096 [P] [US3] Front, `frontend/src/app/session/settings-dialog.component.ts` : type d'échelle et borne. Tant qu'un tour est ouvert, le choix de l'échelle est désactivé, avec l'explication « Un tour de vote est en cours : révélez-le avant de changer l'échelle ». Sur `SCALE_IMPACT`, afficher la liste des valeurs impactées et demander confirmation. Les valeurs « à revoir » sont mises en évidence dans le tableau
- [ ] T097 [US3] Écrire le parcours e2e `frontend/e2e-journeys/us3-import-echelle.spec.ts` (quickstart V9 et V10 ; SC-001 : 20 fonctionnalités importées en moins de 5 minutes)

**Checkpoint** : US1, US2 et US3 fonctionnent indépendamment.

---

## Phase 7 : User Story 4 — Exporter le tableau (Priority: P4)

**Objectif** : exporter le tableau en CSV et au format Confluence, les votes en CSV, et la session complète en JSON, dont les données de priorisation sont réimportables.

**Test indépendant** : exporter 5 fonctionnalités dans chaque format, réimporter l'export JSON et le CSV tableau chacun dans une session vide (quickstart V11 et V12). L'aller-retour JSON dépend du lecteur JSON de US3 (T093).

### Tests de User Story 4 (à écrire d'abord, ils doivent échouer)

- [ ] T098 [P] [US4] Tests des écrivains `backend/src/test/java/com/priorisationepic/adapter/out/io/CsvBoardWriterTest.java`, `ConfluenceWriterTest.java` et `JsonSessionWriterTest.java`. Cas vérifiés :
  - colonnes `Rang;Identifiant;Titre;Description;BV;TC;RR/OE;JS;CoD;WSJF;À revoir;Motif` dans l'ordre du tableau, générées à partir de la définition de la méthode ; avec la méthode fictive de T038a : `Rang;Identifiant;Titre;Description;Reach;Effort;Ratio;À revoir;Motif` ;
  - WSJF « 4,00 » ;
  - `Rang`, `CoD` et `WSJF` vides si la fonctionnalité est incomplète ;
  - UTF-8 avec BOM ;
  - échappement wiki de `| { } [ ]` et sauts de ligne remplacés par `\\` ;
  - titre « Priorisation Fonctionnalités : <nom> (<JJ/MM/AAAA>) » et légende avec la formule et la règle d'égalité ;
  - JSON `formatVersion: 1` sans les votes d'un tour ouvert ;
  - **CSV des votes** `votes-v1` (`CsvVotesWriterTest.java`) : colonnes `Tour;Identifiant;Titre;Pseudo;A voté;BV;TC;RR/OE;JS` (critères de la méthode), une ligne par tour, fonctionnalité et participant attendu, triée par tour, identifiant puis pseudo, **tours révélés uniquement** ;
  - **versions de format** dans le nom des fichiers (`-tableau-v1.csv`, `-votes-v1.csv`, `-confluence-v1.txt`) et dans la légende Confluence (« Format confluence-v1 »), selon la section « Versions des formats » de `contracts/file-formats.md`.
- [ ] T099 [P] [US4] Test d'aller-retour SC-008 `backend/src/test/java/com/priorisationepic/adapter/out/io/JsonRoundTripPropertiesTest.java` (jqwik) : pour une session générée aléatoirement, exporter en JSON, puis importer dans une session vide, redonne des fonctionnalités, des valeurs, une échelle et des scores identiques (données de priorisation, constitution VI v2.2.0). Les tours et les votes ne sont pas réimportés. Ajouter `CsvRoundTripPropertiesTest.java` : exporter le CSV `tableau-v1`, puis l'importer dans une session vide de même échelle, redonne les mêmes fonctionnalités (identifiant, titre, description, BV, TC, RR/OE, JS), donc les mêmes scores et le même ordre (constitution VI)
- [ ] T099a [P] [US4] Test de bout en bout de la généricité (SC-009) `backend/src/test/java/com/priorisationepic/MethodPluggabilityIT.java` (avec `PostgresTestBase`) : la méthode fictive de T038a est enregistrée dans `MethodRegistry` **par la configuration de test uniquement**. Une session créée avec elle permet, sans aucun autre code de test spécifique : saisie directe, tour de vote avec « sans avis », révélation (min – max, écart important, unanimité), consensus, tri, import CSV et JSON, exports CSV, Confluence et JSON, et `sessionState` valide contre le contrat. Le test échoue si une classe hors de `domain/method/` mentionne `bv`, `tc`, `rrOe`, `js`, `cod` ou `wsjf` (règle ArchUnit ou recherche dans les sources)
- [ ] T100 [P] [US4] Test REST `backend/src/test/java/com/priorisationepic/adapter/in/rest/ExportControllerTest.java` : les 4 formats, et le **même masquage que la vue de l'appelant** (SC-004)

### Implémentation de User Story 4

- [ ] T101 [P] [US4] Implémenter `adapter/out/io/CsvBoardWriter.java` (format `tableau-v1`) et `adapter/out/io/CsvVotesWriter.java` (format `votes-v1`, tours révélés uniquement)
- [ ] T102 [P] [US4] Implémenter `adapter/out/io/ConfluenceWriter.java` (sorties `confluence-html` et `confluence-wiki`)
- [ ] T103 [P] [US4] Implémenter `adapter/out/io/JsonSessionWriter.java`, avec `updatedAt` pour chaque vote, et `openedAt` et `revealedAt` pour chaque tour
- [ ] T104 [US4] Implémenter `adapter/in/rest/ExportController.java` (`GET /api/sessions/{sessionId}/exports/{format}` avec `format` parmi `csv`, `csv-votes`, `confluence-wiki`, `confluence-html` et `json`, avec le filtrage `Visibility` du destinataire et le nom de fichier versionné) et ajouter l'opération à `contract/openapi.yaml`
- [ ] T105 [US4] Front, `frontend/src/app/import-export/export-menu.component.ts` : téléchargement du CSV tableau, du CSV des votes et du JSON, bouton « Copier pour Confluence » (copie HTML dans le presse-papiers avec `ClipboardItem`) et téléchargement du *wiki markup*
- [ ] T106 [US4] Écrire le parcours e2e `frontend/e2e-journeys/us4-exports.spec.ts` (quickstart V11 et V12). Étape manuelle (SC-007) : coller l'export « Copier pour Confluence » et le *wiki markup* dans une page Confluence de test, puis cocher le résultat dans la description de la PR (« rendu Confluence vérifié le JJ/MM/AAAA »)

**Checkpoint** : US1 à US4 fonctionnent indépendamment.

---

## Phase 8 : User Story 5 — Revoir une session passée (Priority: P5)

**Objectif** : lister les sessions, clôturer et rouvrir une session, consulter une session clôturée en lecture seule avec ses tours révélés.

**Test indépendant** : clôturer une session, la rouvrir depuis la liste, vérifier le tableau et les tours révélés (quickstart V13).

### Tests de User Story 5 (à écrire d'abord, ils doivent échouer)

- [ ] T107 [P] [US5] Compléter `backend/src/test/java/com/priorisationepic/domain/SessionStatusTest.java` : transitions `IN_PROGRESS → CLOSED → IN_PROGRESS` réservées à l'animateur ; `CLOSE` refusé avec `ROUND_OPEN` tant qu'un tour est ouvert ; en `CLOSED`, toute intention d'écriture reçoit `SESSION_CLOSED`, sauf `REOPEN`
- [ ] T108 [P] [US5] Tests REST `backend/src/test/java/com/priorisationepic/adapter/in/rest/SessionListControllerTest.java` (`GET /api/sessions`, de la plus récente à la plus ancienne)

### Implémentation de User Story 5

- [ ] T109 [US5] Étendre `domain/SessionStatus.java` et `application/ChangeStatusUseCase.java` avec `CLOSE` et `REOPEN` (le `START` existe depuis US2). Compléter `contract/schemas/change-status.json`, ajouter le code `ROUND_OPEN` dans `error.json` et leurs exemples. Vérifier `SESSION_CLOSED` dans tous les cas d'usage d'écriture
- [ ] T110 [US5] Implémenter `adapter/in/rest/SessionListController.java`, avec le schéma `session-summary.json` et ses exemples dans `contract/`
- [ ] T111 [P] [US5] Front, liste des sessions dans `frontend/src/app/home/session-list.component.ts` (nom, animateur, date au format JJ/MM/AAAA, statut ; de la plus récente à la plus ancienne). Une session clôturée s'ouvre en lecture seule, à partir de `GET /api/sessions/{id}`
- [ ] T112 [P] [US5] Front, `frontend/src/app/rounds-history/revealed-rounds.component.ts` : liste des tours révélés (numéro, fonctionnalités, date de révélation) avec, pour chacun, l'affichage de ses votes, comme sur l'écran 9 des maquettes. Les données viennent de `sessionState.revealedRounds` (tous les tours révélés, du plus récent au plus ancien), à ajouter dans `SessionStateAssembler` et dans `contract/schemas/session-state.json`. Pas d'historique des modifications de valeurs (FR-025)
- [ ] T113 [US5] Front, boutons Clôturer et Rouvrir pour l'animateur (Démarrer existe depuis US2), et mode lecture seule, dans `frontend/src/app/session/session-status.component.ts`
- [ ] T114 [US5] Écrire le parcours e2e `frontend/e2e-journeys/us5-consultation.spec.ts` (quickstart V13)

**Checkpoint** : les cinq parcours fonctionnent indépendamment.

---

## Phase 9 : Finitions et sujets transverses

- [ ] T115 [P] Test de charge `deploy/load-test.mjs`, sur le modèle de PP : 10 participants et 50 fonctionnalités. Il vérifie une propagation en moins de 2 s et une ouverture de session (premier `sessionState` reçu après `hello`) en moins de 3 s, soit SC-002 et SC-005
- [ ] T116 [P] Parcours de reconnexion `frontend/e2e-journeys/reconnexion.spec.ts` (quickstart V15)
- [ ] T117 [P] Passe d'accessibilité : axe-core sur tous les écrans, navigation au clavier (y compris l'affichage des définitions WSJF au focus), rendu sur un écran de portable de 1280 px, sur **Chromium, Firefox et WebKit**, dans `frontend/e2e/accessibility.spec.ts` (constitution IV)
- [ ] T118 [P] Relire `frontend/src/app/i18n/messages.fr.ts` et `backend/src/main/resources/messages.properties` : aucun texte d'interface ne doit être codé en dur ailleurs (constitution V), et chaque code d'erreur du contrat doit avoir son message français actionnable (FR-027)
- [ ] T119 Vérifier qu'aucun jeton ni aucun contenu de message WebSocket n'apparaît dans les journaux. Ajouter le test `backend/src/test/java/com/priorisationepic/NoSecretInLogsTest.java`
- [ ] T120 Dérouler intégralement `specs/001-wsjf-prioritization-session/quickstart.md` (V1 à V15, plus les vérifications de sécurité) et mettre à jour `README.md` (lancement local, tests, déploiement)

---

## Dépendances et ordre d'exécution

### Dépendances entre phases

- **Setup (phase 1)** : aucune dépendance.
- **Fondations (phase 2)** : dépendent du setup, et **bloquent tous les parcours**.
- **US1 (phase 3, MVP)** : dépend des fondations.
- **Déploiement (phase 4)** : dépend de US1. On peut le faire plus tard, à tout moment.
- **US2 (phase 5)** : dépend des fondations. Elle s'appuie sur le tableau et les agrégats de US1 (T045 à T051), donc il vaut mieux la faire après US1.
- **US3 (phase 6)** : dépend des fondations et de `Scale` et de l'édition de US1.
- **US4 (phase 7)** : l'export dépend de US1. **L'aller-retour JSON (T099) dépend de T093 (lecteur JSON, US3). L'aller-retour CSV dépend de T092 (lecteur CSV, US3).** Le test de généricité T099a dépend aussi de US2 (tours) et de US3 (lecteurs).
- **US5 (phase 8)** : dépend des fondations, de `change_log` (T029) et du démarrage de session de US2 (T071 : `START`), puisqu'on ne clôture qu'une session en cours. Elle est indépendante de US3 et US4.
- **Finitions (phase 9)** : après les parcours voulus.

### À l'intérieur de chaque parcours

Dans l'ordre : tests (ils doivent échouer), contrat, domaine, persistance, cas d'usage, adaptateurs REST et WebSocket, front, puis e2e.

### Opportunités de parallélisme

- **Phase 1** : T004, T005 et T006 en parallèle de T002 et T003.
- **Phase 2** : T011, T012, T013 et T014 (sécurité) ; T018 à T021 (configuration et garde-fous) ; T026 et T027 (domaine) ; T034, T035 et T036 (front).
- **US1** : tous les tests T037 à T043 ensemble ; puis T045, T046 et T047 (domaine) ; puis T054 et T055 (front) en parallèle du back.
- **US2 à US5** : chaque bloc de tests marqué [P], les lecteurs et écrivains de fichiers (T091, T092, T093 ; T101, T102, T103) et les composants front.
- Une fois T071 (démarrage de session, US2) terminée, **US5** peut avancer en parallèle de la fin de US2, de US3 et de US4 si plusieurs personnes travaillent.

### Exemple de lancement parallèle (US1)

```text
# Tous les tests de US1 ensemble :
T037 WsjfMethodPropertiesTest · T038 RankingTest · T038a MethodGenericityTest · T039 ScaleTest · T040 tests de cas d'usage
T041 tests de contrat REST · T042 tests WebSocket · T043 tests Vitest du tableau

# Puis le domaine ensemble :
T045 Scale · T046 PrioritizationMethod, MethodRegistry, WsjfMethod, Score, Ranking · T047 Session, Participant, Feature
```

---

## Stratégie d'implémentation

### MVP d'abord (US1 seule)

1. Phase 1 (setup), puis phase 2 (fondations, avec **Dependabot, CodeQL et Gitleaks**).
2. Phase 3 (US1).
3. **Arrêt et validation** : quickstart V1 à V3 et V14, CI verte.
4. Phase 4 : mise en ligne sur Render et Neon quand tu le décides.

### Livraison incrémentale

Après le MVP, on ajoute US2 (vote masqué), puis US3 (import et échelle), puis US4 (exports), puis US5 (consultation). Chaque parcours se teste et se déploie seul (étiquette `v*`), en dehors des ateliers.

### Notes

- [P] signifie : fichiers différents, sans dépendance.
- On vérifie que les tests échouent avant d'implémenter (constitution II).
- On fait un commit par tâche ou par groupe logique, et une PR par parcours. CI, CodeQL et Gitleaks doivent être verts.
- Le masquage (SC-004) doit être vérifié **à chaque fois** qu'une donnée sort du serveur : WebSocket, REST et exports.
