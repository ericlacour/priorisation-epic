# Research : Session de priorisation WSJF

**Feature** : `001-wsjf-prioritization-session` | **Date** : 2026-10-11 | **Plan** : [plan.md](./plan.md)

Ce document tranche les inconnues du contexte technique. L'utilisateur a imposé deux
choses :
- back Java, front Angular et PostgreSQL ;
- **alignement complet sur le projet `ericlacour/planning-poker`** : même socle, même
  architecture, WebSocket, même déploiement sur Render.

Render est une **solution temporaire**, commune aux deux projets. Ils migreront ensemble
vers une cible pérenne, qui n'est pas encore choisie. Chaque décision suit le format
Décision, Justification, Alternatives écartées. Pour chaque choix, la référence
planning-poker est indiquée, sous la forme `PP : …`.

## R1. Versions du socle (alignées sur planning-poker)

- **Décision** :
  - Java 25 (LTS, Temurin) et Spring Boot 4.1.x, avec Maven (`mvnw`).
  - Angular 22.x, TypeScript 6.0, Node.js ≥ 24.15 et npm 11.
  - PostgreSQL 17.
  - Les versions exactes suivent celles de planning-poker au démarrage.
- **Justification** : un même socle permet de partager le savoir-faire, les mises à jour
  Dependabot et, plus tard, la migration d'hébergement. PP : `backend/pom.xml`
  (Spring Boot 4.1.1, `java.version` 25), `frontend/package.json` (Angular 22.2,
  TypeScript ~6.0.2).
- **Alternatives écartées** : Spring Boot 4.0 et Angular 21, la proposition du premier
  jet, qui serait désaligné.

## R2. Architecture du back : hexagonale (comme planning-poker)

- **Décision** : paquets `com.priorisationepic.{domain, application, adapter.in.rest,
  adapter.in.ws, adapter.in.scheduling, adapter.out.persistence, adapter.out.io, config}`.
  - `domain` : Java pur. Il contient la méthode WSJF, l'échelle, les règles des tours et
    de visibilité, ainsi que le classement.
  - `application` : un cas d'usage par intention (`CreateSessionUseCase`, `CastVoteUseCase`…)
    et des **ports** (`SessionRepository`, `Broadcaster`, `Clock`…).
  - `adapter.out.persistence` : implémentation JPA des ports. Elle remplace l'adaptateur
    `memory` de planning-poker.
  - `adapter.out.io` : lecture et écriture des fichiers xlsx, csv, Confluence et json.
  - Des règles **ArchUnit** vérifient que `domain` ne dépend de rien, et que
    `application` ne dépend que de `domain`.
- **Justification** : c'est la même organisation que planning-poker
  (`com.planningpoker.{domain, application, adapter.in.{rest,ws,scheduling},
  adapter.out.memory, config}` et `ArchitectureTest`). Elle répond aussi au principe II
  de la constitution : le domaine est testable seul.

## R3. Temps réel : WebSocket brut (comme planning-poker)

- **Décision** : **WebSocket brut, sans STOMP ni SockJS**, sur
  `/ws/sessions/{sessionId}`, avec des trames JSON dont le champ `type` donne le nom du
  message. C'est le **seul canal** des actions de session : ajouter, modifier ou supprimer
  une fonctionnalité, changer les réglages, changer le statut, ouvrir un tour, voter,
  révéler, transmettre le rôle. REST ne sert qu'à l'entrée (créer, rejoindre, lister),
  aux fichiers (import, export, modèle), à l'historique et à la santé de l'application.
- **Poignée de main**, comme dans PP :
  1. le client ouvre le WebSocket ;
  2. son premier message, dans les 5 s, est `hello {participantToken, animationToken?}` ;
  3. le serveur répond `4404` si la session n'existe pas, `4401` si le jeton est inconnu,
     sinon il envoie `sessionState`. Les jetons ne figurent **jamais** dans l'URL.
- **État poussé par destinataire** : après chaque changement, le serveur envoie à
  **chaque connexion** un `sessionState` complet, **filtré pour son destinataire** :
  - ses propres votes uniquement tant que le tour est ouvert ;
  - les valeurs retenues, le CoD et le WSJF masqués pour les fonctionnalités en vote
    (FR-019a) ;
  - `results` vaut `null` tant que le tour n'est pas révélé.

  C'est le principe d'AD-5 dans PP (« pendant un tour caché, seul le destinataire voit sa
  propre carte »). Ces règles sont vérifiées par les exemples du contrat (voir R12) et par
  des tests de contrat aller-retour (PP : `WsContractRoundTripTest`).
- **Maintien de la connexion**, comme dans PP :
  - ping WebSocket toutes les 5 s, et fermeture après 15 s sans réponse ;
  - message `tick` du serveur toutes les 5 s ;
  - message `heartbeat` du client toutes les 5 s, ce qui garde aussi l'hébergeur éveillé ;
  - le client se reconnecte immédiatement, puis après 1, 2, 4 et 8 s, puis toutes les
    10 s.
- **Règles des intentions**, comme dans PP :
  - une intention déjà satisfaite ne change rien ;
  - une intention interdite ne change rien et renvoie `error` ;
  - chaque `sessionState` porte un `version` croissant. Les écritures sur une
    fonctionnalité envoient la `version` lue ; en cas d'écart, le serveur renvoie
    `error STALE_VERSION` avec l'état à jour, sans rien écraser (constitution III).
- **Une seule instance** en V1 : sur Render Free, il n'y a qu'une instance, et l'état des
  connexions reste en mémoire. Passer à plusieurs instances dans la solution pérenne
  demandera une diffusion entre instances. Cette évolution n'est pas faite en V1.
- **Alternatives écartées** : SSE, la proposition du premier jet, écartée pour
  l'alignement ; STOMP, que PP écarte aussi (AD-2).

## R4. Identification sans authentification (constitution III, FR-002, FR-002a)

- **Décision** :
  - `sessionId` : 128 bits aléatoires, encodés en base64url sur 22 caractères, comme dans
    PP. Il forme le lien d'invitation `/s/{sessionId}`.
  - Le **jeton de participant** est reçu en rejoignant la session et conservé dans
    `localStorage` (`pe.token.{sessionId}`, sur le modèle de `pp.token.{sessionId}`). Il
    est envoyé dans `hello`.
  - Le **jeton d'animation** fait 256 bits. Il est remis à la création dans le lien
    d'animation `/s/{sessionId}/animer#{animationToken}` : le fragment `#` n'est jamais
    envoyé au serveur. Le front le conserve dans `pe.animation.{sessionId}` et l'envoie
    dans `hello`. La base n'en stocke que l'empreinte SHA-256.
  - **Transmission du rôle** : un nouveau jeton est généré et envoyé **uniquement** à la
    connexion du bénéficiaire, dans le message `facilitatorHandover`. L'empreinte en base
    est remplacée, ce qui invalide l'ancien jeton.
- **Justification** : c'est le même modèle de jetons que PP (jeton jamais dans l'URL,
  envoyé dans `hello`), avec en plus le jeton d'animation qu'impose la clarification Q3.

## R5. Calcul du score et précision (FR-012 à FR-014, constitution I et II)

- **Décision** :
  - Le calcul vit dans le paquet `domain` : `PrioritizationMethod`, avec `WsjfMethod`
    comme seule implémentation.
  - Le CoD et le JS sont des entiers. Le WSJF est une fraction exacte. Le tri compare les
    fractions par produit croisé, donc sans arrondi.
  - L'affichage arrondit à 2 décimales (au plus proche, la moitié vers le haut, comme le
    `HALF_UP` de PP) avec une virgule.
  - En cas d'égalité, la fonctionnalité au CoD le plus élevé passe devant, puis on
    départage par identifiant, en ordre alphabétique insensible à la casse. Les
    fonctionnalités incomplètes ou hors échelle sont placées en fin de tableau.
  - Le calcul est fait **uniquement côté serveur**. Le front affiche `score` et
    `explanation` tels qu'il les reçoit.
- **Alternatives écartées** : `double` (erreurs d'arrondi aux égalités) ; un calcul côté
  front (deux sources de vérité).

## R6. Échelles (FR-009 à FR-011)

- **Décision** : `Scale` est un objet valeur du domaine, avec un type (`CONTINUOUS` ou
  `FIBONACCI`) et une borne.
  - En continu, les valeurs vont de 1 à la borne. La borne va de 2 à 100 et vaut 10 par
    défaut.
  - En Fibonacci, les valeurs sont celles de {1, 2, 3, 5, 8, 13, 20, 40, 100} qui ne
    dépassent pas la borne. La borne vaut 20 par défaut.
  - Une valeur « à revoir » est **déduite** en la comparant à l'échelle courante. Elle
    n'est jamais stockée comme un état.
  - Pour changer l'échelle, l'intention `updateSettings` sans `confirm` renvoie
    `error SCALE_IMPACT` avec la liste des valeurs impactées. Avec `confirm: true`, le
    changement est appliqué.

## R7. Modifications concurrentes

- **Décision** :
  - Verrou en mémoire **par session**, qui sérialise les intentions d'une même session,
    comme `SessionLocks` dans PP.
  - Verrouillage optimiste en base, avec `@Version` sur Session et Feature.
  - Les intentions sur une fonctionnalité portent `version`. En cas d'écart, le serveur
    renvoie `error STALE_VERSION` et ne modifie rien.
  - La règle « une fonctionnalité dans un seul tour ouvert » est vérifiée sous ce verrou.

## R8. Historique (FR-025, constitution III)

- **Décision** : une table `change_log`, alimentée par les cas d'usage dans la même
  transaction que la modification. Elle enregistre l'auteur (pseudo), la date, l'entité,
  l'action, le champ, l'ancienne et la nouvelle valeur. Elle est lue par
  `GET /api/sessions/{sessionId}/history`.
- **Alternatives écartées** : Hibernate Envers ; des triggers SQL.

## R9. Import et export (FR-007, FR-007a, FR-008, FR-023, FR-024, constitution VI)

- **Bibliothèques** : Apache POI (XSSF) pour le format xlsx, Apache Commons CSV et
  Jackson.
- **Échanges** : les fichiers passent par REST (envoi multipart, téléchargement). Une
  fois l'import confirmé, le serveur diffuse un nouveau `sessionState` à tous.
- **Détails** :
  - en-têtes imposés, modèle Excel téléchargeable ;
  - CSV en UTF-8 avec BOM, séparé par `;` ;
  - Confluence en HTML (copie dans le presse-papiers) et en *wiki markup* ;
  - JSON versionné (`formatVersion: 1`) ;
  - import en deux temps : aperçu, puis confirmation. L'aperçu est conservé 15 min.

  Tout est décrit dans [contracts/file-formats.md](./contracts/file-formats.md).

## R10. Persistance

- **Décision** : Spring Data JPA (Hibernate) et migrations Flyway versionnées
  (`V1__init.sql` …). Les clés sont des UUID, sauf `sessionId` qui est une chaîne de 22
  caractères. Des index uniques portent sur `(session_id, lower(external_id))` et
  `(session_id, lower(pseudo))`, et des contraintes `CHECK ≥ 1` sur les critères. La
  connexion se configure **uniquement par variables d'environnement**
  (`DATABASE_URL` ou `SPRING_DATASOURCE_*`), ce qui rend le passage à un autre hébergeur
  purement une question de configuration.
- **Différence avec PP** : PP garde ses sessions en mémoire (`adapter.out.memory`) et les
  perd à chaque redéploiement. Ici, PostgreSQL est **imposé** par la spec (FR-026 :
  revoir les sessions passées), donc les sessions survivent aux redéploiements et à la
  mise en veille.

## R11. Hébergement V1 : Render, comme planning-poker

- **Décision** : un *blueprint* `deploy/render.yaml`, sur le modèle de PP, avec trois
  ressources :
  1. un **Web Service Docker** `priorisation-epic-api` : image du back compatible
     OpenShift (UID arbitraire, groupe 0, système de fichiers en lecture seule hors
     `/tmp`), contrôle de santé sur `/api/health`, région Frankfurt, déploiement
     automatique désactivé ;
  2. un **Static Site** `priorisation-epic` : le build Angular, avec une règle de
     réécriture `/* → /index.html`, une CSP injectée au build à partir de `API_BASE_URL`
     et les en-têtes de sécurité de PP ;
  3. une **base Render Postgres**, dans la même région, reliée par `DATABASE_URL`
     (`fromDatabase` dans le blueprint).
- **Déploiement** :
  - On déploie en posant une étiquette `v*` sur la tête de `main`, en dehors des ateliers.
    `.github/workflows/deploy.yml` et `deploy/render-deploy.sh` sont repris de PP.
  - Les origines autorisées (`ALLOWED_ORIGINS`) et l'URL de l'API (`API_BASE_URL`) se
    renseignent comme dans PP.
- **Base de données sur Render** : le plan **Free** de Render Postgres expire 30 jours
  après sa création ; il reste 14 jours pour passer à un plan payant, sinon la base est
  supprimée. Il est aussi limité à 1 Go, sans sauvegarde, et à une seule base gratuite
  par espace de travail ([docs Render](https://render.com/docs/free)). La décision est
  donc la suivante :
  - **Free** pour les essais uniquement ;
  - **plan payant d'entrée de gamme** dès qu'on garde de vraies données ;
  - **ou bien** une base PostgreSQL externe gratuite et sans expiration (par exemple
    Neon), reliée par `DATABASE_URL`, sans rien changer au code.

  Le choix final revient à l'utilisateur. Dans tous les cas, l'export JSON (FR-024) sert
  de sauvegarde manuelle.
- **Mise en veille** : un Web Service Render Free s'endort après environ 15 minutes sans
  trafic. Comme dans PP, le `heartbeat` WebSocket garde l'API éveillée pendant un
  atelier, et le front affiche un écran « réveil du service » au premier accès (sur le
  modèle du composant `wake` de PP).
- **Exposition publique** : sur Render, l'application est accessible depuis Internet. La
  spec suppose un usage interne (pas d'authentification, toutes les sessions visibles).
  Pour cette V1 temporaire, ce risque est **accepté**, avec les mêmes garde-fous que PP :
  - limite du nombre de créations de sessions par adresse (`CreationRateLimiter`) ;
  - taille maximale des requêtes (`RequestBodyLimitFilter`) ;
  - taille maximale des messages WebSocket ;
  - CORS restreint à l'origine du front.

  **Consigne d'usage** : ne pas saisir de données confidentielles tant que l'application
  est sur Render.
- **Cible pérenne** : elle reste à choisir, en commun avec PP. Comme l'image est
  compatible OpenShift et que toute la configuration passe par des variables
  d'environnement, la migration ne devrait toucher que `deploy/`.

## R12. Contrat d'échange : dossier `contract/` (comme planning-poker)

- **Décision** : `contract/` à la racine est la **source de vérité** de tous les échanges
  entre le front et le back (AD-6 de PP). Il contient :
  - `openapi.yaml` (OpenAPI 3.2.0) ;
  - `asyncapi.yaml` (AsyncAPI 3.1.0) ;
  - `schemas/*.json` (JSON Schema 2020-12, un `$id` par fichier) ;
  - `examples/<schéma>/<cas>.json` ;
  - `scripts/validate.mjs`, avec Redocly et `@asyncapi/parser`, et ses tests.

  Le contrat est rédigé en anglais, comme dans PP. Le validateur vérifie aussi les
  règles de masquage sur les exemples de `sessionState`. Les fichiers
  [contracts/](./contracts/) de cette spec en sont la **conception** : ils seront
  transcrits dans `contract/` pendant les tâches de fondation.
- **Tests aller-retour** : le back vérifie que ses DTO sérialisés valident contre les
  schémas et que les exemples se désérialisent (PP : `ContractRoundTripTest`,
  `WsContractRoundTripTest`).

## R13. Langue, textes et conventions (constitution V)

- **Décision** :
  - Les identifiants de code et le contrat sont **en anglais**, comme dans PP. Les sigles
    métier restent tels quels : `bv`, `tc`, `rrOe`, `js`, `cod`, `wsjf`.
  - L'interface est en français. Les textes sont centralisés dans
    `frontend/src/app/i18n/messages.fr.ts`.
  - Les codes d'erreur du contrat (`STALE_VERSION`, `SCALE_IMPACT`, …) sont traduits en
    messages français par le front. Les messages REST arrivent en Problem Details, avec
    un `detail` en français.
  - La locale est `fr-FR` : virgule décimale et dates au format JJ/MM/AAAA.

## R14. Tests (constitution II), alignés sur planning-poker

- **Back** :
  - JUnit 5 et AssertJ ; jqwik pour les tests de propriétés du domaine ;
  - `spring-boot-starter-webmvc-test` ;
  - tests WebSocket de bout en bout, comme dans PP ;
  - Testcontainers avec PostgreSQL 17, en plus de PP, puisqu'il y a une base ;
  - ArchUnit ; JaCoCo avec un seuil de 90 % de lignes sur `domain`.
- **Front** : Vitest avec jsdom, et des scripts `node --test` pour la configuration et la
  CSP, comme dans PP.
- **Bout en bout** :
  - Playwright sur Chromium et WebKit, avec des tests e2e contre un faux socket
    (`e2e/`) ;
  - des parcours complets contre le vrai back (`e2e-journeys/`), qui jouent les
    scénarios V1 à V14 du quickstart ;
  - **axe-core** pour l'accessibilité (`@axe-core/playwright`).
- **Contrat** : `npm run validate` et `npm test` dans `contract/`.

## R15. CI et outillage de sécurité (constitution)

- **CI** (`.github/workflows/ci.yml`, même découpage que PP) : jobs `contract`,
  `backend` (`./mvnw -B verify`, puis build de l'image Docker, puis démarrage de l'image
  sous un UID arbitraire en lecture seule avec vérification des journaux JSON),
  `deploy-script`, `frontend` et `journeys`.
- **Dependabot** (`.github/dependabot.yml`, mêmes conventions que PP) :
  - écosystèmes `npm` (`/frontend`, `/contract`), `maven` (`/backend`), `docker`
    (`/backend`) et `github-actions` (`/`) ;
  - fréquence **mensuelle**, délai de **7 jours** (`cooldown`) avant de proposer une
    nouvelle version ;
  - mêmes groupes que PP (Angular avec TypeScript, Temurin, mises à jour mineures) ;
  - mêmes exclusions (pas de version majeure Java, pas de version majeure ou mineure de
    TypeScript en dehors d'un `ng update`) ;
  - les **mises à jour de sécurité** de Dependabot sont activées dans les réglages du
    dépôt.
- **CodeQL** (`.github/workflows/codeql.yml`) : langages `java-kotlin`,
  `javascript-typescript` et `actions`, sur chaque PR, sur `main` et une fois par
  semaine. **C'est un ajout par rapport à PP**, imposé par la constitution.
- **Gitleaks** (`.github/workflows/gitleaks.yml` et `.gitleaks.toml`) : sur chaque PR et
  sur `main`. **Également un ajout par rapport à PP.**
- **Protection de `main`** : CI, CodeQL et Gitleaks sont des contrôles obligatoires avant
  de merger.

## R16. Observabilité

- **Décision** : comme dans PP, un endpoint `/api/health` (contrôleur dédié, utilisé par
  Render) et des journaux JSON structurés (`@timestamp`), vérifiés en CI. Les jetons et
  le contenu des messages WebSocket ne sont **jamais** journalisés.
